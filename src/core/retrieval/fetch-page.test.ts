import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FETCH_FAILURES, fetchPage } from "./fetch-page";
import {
  startFixtureServer,
  type FixtureServer,
} from "../testing/fixture-server";

let site: FixtureServer;

const local = {
  allowPrivateHosts: true,
  maxAttempts: 1,
  sleep: async () => {},
};

beforeAll(async () => {
  site = await startFixtureServer();
});

afterAll(async () => {
  await site.close();
});

describe("fetchPage against a live site", () => {
  it("returns the body and the URL it came from", async () => {
    const outcome = await fetchPage(`${site.origin}/acme/`, local);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.page.body).toContain("Freight routing");
    expect(outcome.page.url).toBe(`${site.origin}/acme/`);
    expect(outcome.page.contentType).toBe("text/html");
  });

  it("resolves a path without an extension", async () => {
    const outcome = await fetchPage(`${site.origin}/acme/hb/2847`, local);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.page.body).toContain("How we hire engineers");
  });

  it("reports a 404 instead of throwing", async () => {
    const outcome = await fetchPage(`${site.origin}/acme/does-not-exist`, local);

    expect(outcome).toMatchObject({
      ok: false,
      reason: FETCH_FAILURES.HTTP_ERROR,
      detail: "HTTP 404",
    });
  });

  it("follows a redirect and reports the destination", async () => {
    const outcome = await fetchPage(`${site.origin}/redirect-to-about`, local);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.page.url).toBe(`${site.origin}/acme/about`);
    expect(outcome.page.body).toContain("About us");
  });

  it("gives up on a redirect loop", async () => {
    const outcome = await fetchPage(`${site.origin}/redirect-loop`, {
      ...local,
      maxRedirects: 3,
    });

    expect(outcome).toMatchObject({
      ok: false,
      reason: FETCH_FAILURES.TOO_MANY_REDIRECTS,
    });
  });

  it("refuses a content type it does not process", async () => {
    const outcome = await fetchPage(`${site.origin}/binary`, local);

    expect(outcome).toMatchObject({
      ok: false,
      reason: FETCH_FAILURES.UNSUPPORTED_CONTENT_TYPE,
    });
  });

  it("refuses a body above the size cap", async () => {
    const outcome = await fetchPage(`${site.origin}/oversized`, {
      ...local,
      maxBytes: 50_000,
    });

    expect(outcome).toMatchObject({ ok: false, reason: FETCH_FAILURES.TOO_LARGE });
  });

  it("times out a server that never responds", async () => {
    const outcome = await fetchPage(`${site.origin}/timeout`, {
      ...local,
      timeoutMs: 150,
    });

    expect(outcome).toMatchObject({ ok: false, reason: FETCH_FAILURES.TIMEOUT });
  });

  it("reports a refused connection", async () => {
    const outcome = await fetchPage("http://127.0.0.1:9/", local);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect([FETCH_FAILURES.NETWORK, FETCH_FAILURES.TIMEOUT]).toContain(
      outcome.reason,
    );
  });
});

describe("fetchPage retries", () => {
  it("retries a 500 and succeeds when the server recovers", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return calls < 3
        ? new Response("busy", { status: 503 })
        : new Response("<html><body>ok</body></html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          });
    };

    const outcome = await fetchPage("http://localhost/x", {
      allowPrivateHosts: true,
      fetchImpl,
      sleep: async () => {},
    });

    expect(calls).toBe(3);
    expect(outcome.ok).toBe(true);
  });

  it("honours retry-after before trying again", async () => {
    const waits: number[] = [];
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return calls === 1
        ? new Response("slow down", {
            status: 429,
            headers: { "retry-after": "2" },
          })
        : new Response("<html><body>ok</body></html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          });
    };

    await fetchPage("http://localhost/x", {
      allowPrivateHosts: true,
      fetchImpl,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });

    expect(waits).toEqual([2000]);
  });

  it("reports the failure once attempts run out", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("ECONNRESET");
    };

    const outcome = await fetchPage("http://localhost/x", {
      allowPrivateHosts: true,
      fetchImpl,
      sleep: async () => {},
      maxAttempts: 2,
    });

    expect(outcome).toMatchObject({
      ok: false,
      reason: FETCH_FAILURES.NETWORK,
      detail: "ECONNRESET",
    });
  });
});

describe("fetchPage url guarding", () => {
  it("refuses a blocked URL before making a request", async () => {
    let called = false;
    const outcome = await fetchPage("http://127.0.0.1/", {
      allowPrivateHosts: false,
      fetchImpl: async () => {
        called = true;
        return new Response("");
      },
    });

    expect(called).toBe(false);
    expect(outcome).toMatchObject({
      ok: false,
      reason: FETCH_FAILURES.BLOCKED_URL,
    });
  });

  it("re-checks the destination of a redirect into a private range", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url === "https://public.example/") {
        return new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data/" },
        });
      }
      return new Response("<html><body>secrets</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    };

    const outcome = await fetchPage("https://public.example/", {
      allowPrivateHosts: false,
      fetchImpl,
      resolveHost: async () => ["93.184.216.34"],
      sleep: async () => {},
    });

    expect(outcome).toMatchObject({
      ok: false,
      reason: FETCH_FAILURES.BLOCKED_URL,
    });
    if (outcome.ok) return;
    expect(outcome.detail).toContain("169.254.169.254");
  });
});
