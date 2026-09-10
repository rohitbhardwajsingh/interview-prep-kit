import net from "node:net";
import { defineConfig } from "vitest/config";

/**
 * How the suite is parallelised depends on what database it can find.
 *
 * With a real Mongo (Docker, or a local server) the default fork-per-file
 * parallelism is fine and fast. Without one, the harness falls back to a
 * single in-memory Mongo, and throwing forty concurrent forks at one ephemeral
 * mongod starves it enough to flake writes under load. So when no real Mongo is
 * reachable the run is collapsed into a single fork — slower, but deterministic,
 * which is what a fresh clone with no Docker needs `npm test` to be.
 */
function reachable(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(400);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

function testMongoTarget(): { host: string; port: number } {
  const url = process.env["TEST_MONGO_URL"] ?? "mongodb://127.0.0.1:27019";
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || "127.0.0.1",
      port: Number(parsed.port) || 27017,
    };
  } catch {
    return { host: "127.0.0.1", port: 27019 };
  }
}

export default defineConfig(async () => {
  const { host, port } = testMongoTarget();
  const hasRealMongo = await reachable(host, port);

  return {
    test: {
      // Deterministic on the in-memory fallback; fully parallel with a real DB.
      pool: "forks",
      poolOptions: { forks: { singleFork: !hasRealMongo } },
    },
  };
});
