import { loadDotEnv } from "../cli/env";
import { createLlmClient, readLlmConfig } from "../core/llm/create-client";
import { createLlmPorts } from "../core/generation/llm-ports";
import { allowPrivateHostsFromEnv } from "../core/retrieval/url-guard";
import { createApp } from "./app";
import { ConfigError, readServerConfig } from "./config";
import { connectStore } from "./db";

async function main(): Promise<void> {
  loadDotEnv();

  const config = readServerConfig(process.env);
  const store = await connectStore(config.mongoUrl, config.mongoDb);

  // One client for both the generation pipeline and answer review, so a
  // single rate limit and a single model choice cover everything.
  const llm = createLlmClient(readLlmConfig(process.env));

  const { app } = createApp({
    config,
    store,
    llm,
    ports: createLlmPorts({
      llm,
      allowPrivateHosts: allowPrivateHostsFromEnv(process.env),
    }),
  });

  const server = app.listen(config.port, () => {
    console.log(`[api] listening on http://localhost:${config.port}`);
  });

  // In-flight generations are given a chance to record a terminal state,
  // otherwise a restart would leave kits claimed by a run that no longer
  // exists until their heartbeat goes stale.
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[api] ${signal} received, shutting down`);
    server.close();
    await store.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((cause: unknown) => {
  if (cause instanceof ConfigError) {
    console.error(`[api] ${cause.message}`);
    process.exit(78); // EX_CONFIG
  }
  console.error(cause);
  process.exit(1);
});
