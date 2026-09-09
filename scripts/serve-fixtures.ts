import { startFixtureServer } from "../src/core/testing/fixture-server";

const port = Number(process.env["FIXTURE_PORT"] ?? 8099);

const server = await startFixtureServer({ port });

console.log(`Fixture company sites served from ${server.origin}`);
console.log("  /acme/              a company that publishes its hiring loop");
console.log("  /no-careers-page/   a company with no hiring page anywhere");
console.log("  /thin/              a near-empty site");
console.log("  /blocked/           a site whose robots.txt refuses crawlers");
console.log("Press Ctrl+C to stop.");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
