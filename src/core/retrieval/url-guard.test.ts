import { describe, expect, it } from "vitest";
import {
  URL_REJECTIONS,
  allowPrivateHostsFromEnv,
  guardUrl,
} from "./url-guard";

const permissive = { allowPrivateHosts: true };
const strict = { allowPrivateHosts: false };

function resolvingTo(...addresses: string[]) {
  return { allowPrivateHosts: false, resolveHost: async () => addresses };
}

describe("guardUrl in production mode", () => {
  it("allows a public host", async () => {
    const result = await guardUrl(
      "https://gitlab.com/handbook/hiring/",
      resolvingTo("172.65.251.78"),
    );

    expect(result.ok).toBe(true);
  });

  it.each([
    "http://localhost:8099/acme/",
    "http://LOCALHOST/",
    "http://api.localhost/",
    "http://127.0.0.1/",
    "http://127.5.5.5/",
    "http://10.1.2.3/",
    "http://192.168.0.10/",
    "http://172.16.4.4/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://0.0.0.0/",
  ])("blocks %s", async (raw) => {
    const result = await guardUrl(raw, strict);

    expect(result).toMatchObject({
      ok: false,
      reason: URL_REJECTIONS.PRIVATE_ADDRESS,
    });
  });

  it("blocks a public hostname that resolves into a private range", async () => {
    const result = await guardUrl(
      "https://internal.example.com/",
      resolvingTo("10.0.0.7"),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: URL_REJECTIONS.PRIVATE_ADDRESS,
    });
  });

  it("blocks when any resolved address is private", async () => {
    const result = await guardUrl(
      "https://mixed.example.com/",
      resolvingTo("93.184.216.34", "127.0.0.1"),
    );

    expect(result.ok).toBe(false);
  });

  it("reports a host that cannot be resolved", async () => {
    const result = await guardUrl("https://nope.example/", {
      allowPrivateHosts: false,
      resolveHost: async () => {
        throw new Error("ENOTFOUND");
      },
    });

    expect(result).toMatchObject({
      ok: false,
      reason: URL_REJECTIONS.UNRESOLVABLE_HOST,
    });
  });
});

describe("guardUrl when private hosts are permitted", () => {
  it("allows the loopback address the batch fixtures are served from", async () => {
    const result = await guardUrl("http://localhost:8099/acme/", permissive);

    expect(result.ok).toBe(true);
  });

  it("still refuses a protocol it cannot fetch", async () => {
    const result = await guardUrl("file:///etc/passwd", permissive);

    expect(result).toMatchObject({
      ok: false,
      reason: URL_REJECTIONS.UNSUPPORTED_PROTOCOL,
    });
  });

  it("still refuses embedded credentials", async () => {
    const result = await guardUrl("http://user:pass@example.com/", permissive);

    expect(result).toMatchObject({
      ok: false,
      reason: URL_REJECTIONS.CREDENTIALS_IN_URL,
    });
  });

  it("still refuses a malformed URL", async () => {
    const result = await guardUrl("not a url", permissive);

    expect(result).toMatchObject({ ok: false, reason: URL_REJECTIONS.MALFORMED });
  });
});

describe("allowPrivateHostsFromEnv", () => {
  it("blocks private hosts in production", () => {
    expect(allowPrivateHostsFromEnv({ NODE_ENV: "production" })).toBe(false);
  });

  it("permits them everywhere else, so the batch fixtures are reachable", () => {
    expect(allowPrivateHostsFromEnv({})).toBe(true);
    expect(allowPrivateHostsFromEnv({ NODE_ENV: "test" })).toBe(true);
  });

  it("lets an explicit flag override the environment either way", () => {
    expect(
      allowPrivateHostsFromEnv({
        NODE_ENV: "production",
        ALLOW_PRIVATE_HOSTS: "true",
      }),
    ).toBe(true);
    expect(
      allowPrivateHostsFromEnv({ NODE_ENV: "development", ALLOW_PRIVATE_HOSTS: "false" }),
    ).toBe(false);
  });
});
