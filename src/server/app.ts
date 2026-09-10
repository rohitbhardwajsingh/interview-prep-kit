import MongoStore from "connect-mongo";
import express, { type Express } from "express";
import session from "express-session";
import type { LlmClient } from "../core/llm/types";
import type { KitPipelinePorts } from "../core/pipeline/ports";
import { attemptRoutes } from "./attempts/routes";
import { authRoutes } from "./auth/routes";
import type { ServerConfig } from "./config";
import type { Store } from "./db";
import { errorHandler, notFoundHandler } from "./http/errors";
import { createJobRunner, type JobRunner } from "./jobs/runner";
import { kitRoutes } from "./kits/routes";
import { practiceRoutes } from "./practice/routes";
import { storyRoutes } from "./stories/routes";

export const SESSION_COOKIE = "prepkit.sid";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AppDependencies {
  config: ServerConfig;
  store: Store;
  ports: KitPipelinePorts;
  runner?: JobRunner;
  /**
   * Used to judge a spoken answer. Separate from `ports` because that is the
   * kit-generation pipeline, and answer review is not part of it: a kit is
   * generated once, whereas answers are reviewed all through the week.
   */
  llm?: LlmClient;
}

export interface BuiltApp {
  app: Express;
  runner: JobRunner;
}

export function createApp(dependencies: AppDependencies): BuiltApp {
  const { config, store, ports } = dependencies;
  const runner = dependencies.runner ?? createJobRunner({ store, ports });

  const app = express();

  // Behind a proxy in production, so the secure cookie flag is trusted.
  if (config.isProduction) app.set("trust proxy", 1);
  app.disable("x-powered-by");

  // The browser is a different origin, so it needs explicit permission to send
  // the session cookie. A single allowed origin rather than a wildcard,
  // because credentialed requests and wildcards are mutually exclusive anyway.
  app.use((request, response, next) => {
    response.header("Access-Control-Allow-Origin", config.webOrigin);
    response.header("Access-Control-Allow-Credentials", "true");
    response.header("Access-Control-Allow-Headers", "content-type");
    response.header(
      "Access-Control-Allow-Methods",
      "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    );
    response.header("Vary", "Origin");
    if (request.method === "OPTIONS") {
      response.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "1mb" }));

  app.use(
    session({
      name: SESSION_COOKIE,
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      store: MongoStore.create({
        client: store.db.client,
        dbName: config.mongoDb,
        collectionName: "sessions",
        ttl: SESSION_TTL_MS / 1000,
      }),
      cookie: {
        // Not readable from JavaScript, so an injected script cannot steal it.
        httpOnly: true,
        sameSite: "lax",
        secure: config.isProduction,
        maxAge: SESSION_TTL_MS,
        path: "/",
      },
    }),
  );

  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.use("/auth", authRoutes(store));
  app.use("/kits", kitRoutes(store, runner));
  // Mounted under /kits too, so practice state is addressed alongside its kit.
  app.use("/kits", practiceRoutes(store));
  app.use(
    "/kits",
    attemptRoutes({ store, ...(dependencies.llm ? { llm: dependencies.llm } : {}) }),
  );
  app.use("/stories", storyRoutes(store));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return { app, runner };
}
