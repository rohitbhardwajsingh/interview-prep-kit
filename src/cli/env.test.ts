import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadDotEnv } from "./env";

const TOUCHED = ["PREPKIT_TEST_ONE", "PREPKIT_TEST_TWO"] as const;

afterEach(() => {
  for (const name of TOUCHED) delete process.env[name];
});

async function dirWithEnvFile(contents: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "prepkit-env-"));
  await writeFile(join(dir, ".env"), contents, "utf8");
  return dir;
}

describe("loadDotEnv", () => {
  it("reads a key out of a .env file", async () => {
    const dir = await dirWithEnvFile("PREPKIT_TEST_ONE=from-file\n");

    loadDotEnv(dir);

    expect(process.env["PREPKIT_TEST_ONE"]).toBe("from-file");
  });

  it("does nothing when there is no .env, which is the normal case", async () => {
    const dir = await mkdtemp(join(tmpdir(), "prepkit-noenv-"));

    expect(() => loadDotEnv(dir)).not.toThrow();
  });

  it("lets a real environment variable win over the file", async () => {
    const dir = await dirWithEnvFile("PREPKIT_TEST_TWO=from-file\n");
    process.env["PREPKIT_TEST_TWO"] = "from-shell";

    loadDotEnv(dir);

    expect(process.env["PREPKIT_TEST_TWO"]).toBe("from-shell");
  });

  it("handles a quoted value, which is how a pasted key often arrives", async () => {
    const dir = await dirWithEnvFile('PREPKIT_TEST_ONE="quoted-value"\n');

    loadDotEnv(dir);

    expect(process.env["PREPKIT_TEST_ONE"]).toBe("quoted-value");
  });
});
