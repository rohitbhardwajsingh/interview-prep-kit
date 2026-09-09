import { startFakeProvider } from "../src/core/testing/fake-provider";

/**
 * Runs the batch suite's model double as a standalone server, so the whole
 * stack can be exercised end to end without a real key or any spend. Point
 * LLM_BASE_URL at the address it prints.
 */
const provider = await startFakeProvider();
console.log(provider.baseUrl);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void provider.close().then(() => process.exit(0));
  });
}
