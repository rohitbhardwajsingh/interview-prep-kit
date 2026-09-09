/**
 * Runs one case end to end against the local fixture site and a fake provider,
 * then prints the kit. Useful for eyeballing output shape without a key.
 */
import { createLlmPorts } from "../src/core/generation/llm-ports";
import { createLlmClient, readLlmConfig } from "../src/core/llm/create-client";
import { runKit } from "../src/core/pipeline/run-kit";
import { startFakeProvider } from "../src/core/testing/fake-provider";
import { startFixtureServer } from "../src/core/testing/fixture-server";

const site = await startFixtureServer();
const provider = await startFakeProvider();

const config = readLlmConfig({
  GEMINI_API_KEY: "fake-key",
  LLM_BASE_URL: provider.baseUrl,
});

const ports = createLlmPorts({
  llm: createLlmClient(config),
  allowPrivateHosts: true,
});

const result = await runKit(
  {
    jd: [
      "Senior Backend Engineer",
      "",
      "You will own our routing service. Strong Go, production Kubernetes and",
      "Postgres at scale are required. Mentoring is a plus.",
    ].join("\n"),
    companyUrl: `${site.origin}/acme/`,
    days: 5,
  },
  ports,
);

console.log("--- trace ---");
for (const entry of result.trace) {
  console.log(`  [${entry.status}] ${entry.step}: ${entry.detail}`);
}
console.log("\n--- kit ---");
console.log(JSON.stringify(result.kit, null, 2));

await Promise.all([site.close(), provider.close()]);
