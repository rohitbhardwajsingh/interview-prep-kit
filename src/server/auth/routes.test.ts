import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFakePorts } from "../../core/testing/fake-ports";
import { createHarness, mongoAvailable, type Harness } from "../testing/harness";

const available = await mongoAvailable();

describe.skipIf(!available)("auth routes", () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await createHarness(createFakePorts());
  });

  afterAll(async () => {
    await harness.close();
  });

  const credentials = {
    email: "Ada@Example.com",
    password: "a-long-enough-passphrase",
  };

  it("registers a user, signs them in, and never returns the hash", async () => {
    const response = await request(harness.app)
      .post("/auth/register")
      .send(credentials);

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe("ada@example.com");
    expect(JSON.stringify(response.body)).not.toContain("scrypt");
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
  });

  it("refuses a second registration of the same address", async () => {
    const response = await request(harness.app)
      .post("/auth/register")
      .send({ ...credentials, email: "ada@example.com" });

    expect(response.status).toBe(409);
  });

  it("refuses a password shorter than the minimum", async () => {
    const response = await request(harness.app)
      .post("/auth/register")
      .send({ email: "short@example.com", password: "short" });

    expect(response.status).toBe(400);
  });

  it("gives the same answer for a wrong password and a missing account", async () => {
    const wrongPassword = await request(harness.app)
      .post("/auth/login")
      .send({ email: "ada@example.com", password: "not-the-passphrase" });
    const noSuchUser = await request(harness.app)
      .post("/auth/login")
      .send({ email: "nobody@example.com", password: "not-the-passphrase" });

    expect(wrongPassword.status).toBe(401);
    expect(noSuchUser.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(noSuchUser.body.error.message);
  });

  it("does not reveal the password rule on a failed sign-in", async () => {
    // A validation detail here would confirm the address exists.
    const response = await request(harness.app)
      .post("/auth/login")
      .send({ email: "ada@example.com", password: "x" });

    expect(response.status).toBe(401);
    expect(response.body.error.details).toBeUndefined();
  });

  it("issues a different session id after signing in", async () => {
    const agent = request.agent(harness.app);

    // Establishes an anonymous session first, which is what a fixation
    // attack would try to reuse.
    await agent.get("/auth/me");
    const before = await agent.get("/auth/me");

    await agent
      .post("/auth/login")
      .send({ email: "ada@example.com", password: credentials.password })
      .expect(200);

    const after = await agent.get("/auth/me");
    expect(after.body.user.email).toBe("ada@example.com");
    expect(after.headers["set-cookie"]).not.toEqual(before.headers["set-cookie"]);
  });

  it("reports nobody for an anonymous caller", async () => {
    const response = await request(harness.app).get("/auth/me");

    expect(response.status).toBe(200);
    expect(response.body.user).toBeNull();
  });

  it("ends the session on sign-out", async () => {
    const agent = request.agent(harness.app);
    await agent
      .post("/auth/login")
      .send({ email: "ada@example.com", password: credentials.password })
      .expect(200);

    await agent.post("/auth/logout").expect(204);

    const after = await agent.get("/auth/me");
    expect(after.body.user).toBeNull();
  });

  it("refuses protected routes without a session", async () => {
    const kits = await request(harness.app).get("/kits");
    const stories = await request(harness.app).get("/stories");

    expect(kits.status).toBe(401);
    expect(stories.status).toBe(401);
  });
});
