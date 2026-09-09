import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import type { Store } from "../db";
import { badRequest, conflict, route, unauthorised } from "../http/errors";
import { hashPassword, verifyPassword } from "./passwords";
import { credentialsSchema, toPublicUser, type PublicUser } from "./types";

/** Duplicate key, the only Mongo error this layer expects. */
const DUPLICATE_KEY = 11000;

function isDuplicateKey(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    (cause as { code?: number }).code === DUPLICATE_KEY
  );
}

/**
 * Rotates the session id on every privilege change, so a fixated id captured
 * before sign-in is useless afterwards.
 */
function startSession(request: Request, userId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.regenerate((error) => {
      if (error) return reject(error);
      request.session.userId = userId;
      request.session.save((saveError) =>
        saveError ? reject(saveError) : resolve(),
      );
    });
  });
}

function endSession(request: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.destroy((error) => (error ? reject(error) : resolve()));
  });
}

export function authRoutes(store: Store): Router {
  const router = Router();

  router.post(
    "/register",
    route(async (request, response) => {
      const { email, password } = credentialsSchema.parse(request.body);

      const record = {
        _id: randomUUID(),
        email,
        passwordHash: await hashPassword(password),
        createdAt: new Date(),
      };

      try {
        await store.users.insertOne(record);
      } catch (cause) {
        // The unique index decides this, not a prior read, so two simultaneous
        // registrations of one address cannot both succeed.
        if (isDuplicateKey(cause)) {
          throw conflict("That email is already registered");
        }
        throw cause;
      }

      await startSession(request, record._id);
      response.status(201).json({ user: toPublicUser(record) });
    }),
  );

  router.post(
    "/login",
    route(async (request, response) => {
      const parsed = credentialsSchema.safeParse(request.body);
      if (!parsed.success) {
        // Deliberately not the schema's detail: telling an attacker the
        // password was too short to be real is telling them about the account.
        throw unauthorised("Those credentials did not match");
      }

      const user = await store.users.findOne({ email: parsed.data.email });

      // Verified even when no user matched, so a missing account and a wrong
      // password take the same time and cannot be told apart.
      const hash = user?.passwordHash ?? (await hashPassword(randomUUID()));
      const matches = await verifyPassword(parsed.data.password, hash);

      if (!user || !matches) throw unauthorised("Those credentials did not match");

      await startSession(request, user._id);
      response.json({ user: toPublicUser(user) });
    }),
  );

  router.post(
    "/logout",
    route(async (request, response) => {
      await endSession(request);
      response.clearCookie("prepkit.sid");
      response.status(204).end();
    }),
  );

  router.get(
    "/me",
    route(async (request, response) => {
      const userId = request.session.userId;
      if (!userId) {
        response.json({ user: null });
        return;
      }

      const user = await store.users.findOne({ _id: userId });
      if (!user) {
        // The session outlived its user, so it is not a valid session.
        await endSession(request);
        response.json({ user: null });
        return;
      }

      const payload: { user: PublicUser } = { user: toPublicUser(user) };
      response.json(payload);
    }),
  );

  router.all(
    "/register",
    route(async () => {
      throw badRequest("Use POST to register");
    }),
  );

  return router;
}
