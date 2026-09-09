import { randomUUID } from "node:crypto";
import type { Express } from "express";
import type { KitPipelinePorts } from "../../core/pipeline/ports";
import { createApp } from "../app";
import type { ServerConfig } from "../config";
import { connectStore, type Store } from "../db";
import { createJobRunner, type JobRunner } from "../jobs/runner";

export const TEST_MONGO_URL =
  process.env["TEST_MONGO_URL"] ?? "mongodb://127.0.0.1:27018";

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
  try {
    const store = await connectStore(TEST_MONGO_URL, "probe");
    await store.close();
    return true;
  } catch {
    return false;
  }
}

export async function createHarness(
  ports: KitPipelinePorts,
  overrides: { timeoutMs?: number } = {},
): Promise<Harness> {
  // A database per harness, so suites running in parallel cannot see each
  // other's users, and no test has to clean up after itself.
  const dbName = `test_${randomUUID().replace(/-/g, "")}`;
  const store = await connectStore(TEST_MONGO_URL, dbName);

  const config: ServerConfig = {
    port: 0,
    mongoUrl: TEST_MONGO_URL,
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
  const { app } = createApp({ config, store, ports, runner });

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
