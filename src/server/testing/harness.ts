import { randomUUID } from "node:crypto";
import type { Express } from "express";
import type { LlmClient } from "../../core/llm/types";
import type { KitPipelinePorts } from "../../core/pipeline/ports";
import { createApp } from "../app";
import type { ServerConfig } from "../config";
import { connectStore, type Store } from "../db";
import { createJobRunner, type JobRunner } from "../jobs/runner";

/**
 * Deliberately not the port the dev stack uses. The suite creates and drops
 * databases freely, so pointing it at a Mongo someone is developing against
 * means a test run quietly destroys the kits they were working on.
 */
const CONFIGURED_MONGO_URL =
  process.env["TEST_MONGO_URL"] ?? "mongodb://127.0.0.1:27019";

/**
 * Resolved once, because starting an in-memory server is expensive and every
 * harness in the run should share it. Shutdown is left to the library, which
 * kills its own child on process exit.
 */
let resolved: { url: string } | null = null;

async function reachable(url: string): Promise<boolean> {
  try {
    const store = await connectStore(url, "probe");
    await store.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * A real Mongo if one is listening, an in-memory one if not.
 *
 * Preferring the configured server keeps CI and Docker-based runs testing
 * against the thing they actually deploy. Falling back means `npm test`
 * still works on a laptop with no Docker running, which is the difference
 * between a suite people run and one they skip.
 */
async function resolveMongo(): Promise<{ url: string } | null> {
  if (resolved) return resolved;

  if (await reachable(CONFIGURED_MONGO_URL)) {
    resolved = { url: CONFIGURED_MONGO_URL };
    return resolved;
  }

  try {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    const server = await MongoMemoryServer.create();
    resolved = { url: server.getUri() };
    return resolved;
  } catch {
    // No server and no way to start one: the suite says so and skips rather
    // than failing with a connection timeout that looks like a broken test.
    return null;
  }
}

export interface Harness {
  app: Express;
  store: Store;
  runner: JobRunner;
  close(): Promise<void>;
}

/**
 * Reports whether a Mongo is reachable, so the API suite can be skipped with a
 * clear reason on a machine that has not started one rather than failing with
 * a connection timeout that looks like a broken test.
 */
export async function mongoAvailable(): Promise<boolean> {
  return (await resolveMongo()) !== null;
}

export async function createHarness(
  ports: KitPipelinePorts,
  overrides: { timeoutMs?: number; llm?: LlmClient } = {},
): Promise<Harness> {
  const mongo = await resolveMongo();
  if (!mongo) throw new Error("No Mongo is reachable and none could be started");

  // A database per harness, so suites running in parallel cannot see each
  // other's users, and no test has to clean up after itself.
  const dbName = `test_${randomUUID().replace(/-/g, "")}`;
  const store = await connectStore(mongo.url, dbName);

  const config: ServerConfig = {
    port: 0,
    mongoUrl: mongo.url,
    mongoDb: dbName,
    webOrigin: "http://localhost:3000",
    sessionSecret: "test-secret-not-used-anywhere-real",
    isProduction: false,
  };

  const runner = createJobRunner({
    store,
    ports,
    timeoutMs: overrides.timeoutMs ?? 5_000,
  });
  const { app } = createApp({
    config,
    store,
    ports,
    runner,
    ...(overrides.llm ? { llm: overrides.llm } : {}),
  });

  return {
    app,
    store,
    runner,
    async close() {
      await runner.drain();
      await store.db.dropDatabase();
      await store.close();
    },
  };
}
