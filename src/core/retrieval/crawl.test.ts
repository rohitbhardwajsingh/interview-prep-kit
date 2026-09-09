import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crawlCompanySite, type CrawlResult } from "./crawl";
import {
  startFixtureServer,
  type FixtureServer,
} from "../testing/fixture-server";

let site: FixtureServer;

function crawl(path: string, overrides = {}): Promise<CrawlResult> {
  return crawlCompanySite({
    startUrl: `${site.origin}${path}`,
    allowPrivateHosts: true,
    politenessMs: 0,
    maxAttempts: 1,
    sleep: async () => {},
    ...overrides,
  });
}

function urls(result: CrawlResult): string[] {
  return result.pages.map((page) => page.url.replace(site.origin, ""));
}

beforeAll(async () => {
  site = await startFixtureServer();
});

afterAll(async () => {
  await site.close();
});

describe("crawlCompanySite on a company that publishes its loop", () => {
  it("finds the hiring page two hops from the homepage", async () => {
    const result = await crawl("/acme/");

    expect(urls(result)).toContain("/acme/hb/2847");
  });

  it("keeps the interview loop content, not just the URL", async () => {
    const result = await crawl("/acme/");
    const hiringPage = result.pages.find((page) => page.url.includes("/hb/2847"));

    expect(hiringPage?.text).toContain("Take-home");
    expect(hiringPage?.title).toContain("How we hire");
  });

  it("also finds what the company does", async () => {
    const result = await crawl("/acme/");

    expect(urls(result)).toContain("/acme/about");
  });

  it("does not spend fetches on login or legal pages", async () => {
    const fetched = urls(await crawl("/acme/"));

    expect(fetched).not.toContain("/acme/login");
    expect(fetched).not.toContain("/acme/privacy");
    expect(fetched).not.toContain("/acme/terms");
  });

  it("stays on the company's own origin", async () => {
    const result = await crawl("/acme/");

    for (const page of result.pages) {
      expect(page.url.startsWith(site.origin)).toBe(true);
    }
  });

  it("respects the fetch budget", async () => {
    const result = await crawl("/acme/", { maxPages: 3 });

    expect(result.pages.length).toBeLessThanOrEqual(3);
  });

  it("never fetches the same page twice", async () => {
    const fetched = urls(await crawl("/acme/"));

    expect(new Set(fetched).size).toBe(fetched.length);
  });

  it("records that a robots file was read", async () => {
    expect((await crawl("/acme/")).robotsFound).toBe(true);
  });
});

describe("crawlCompanySite on the hard cases", () => {
  it("returns an honest empty hiring result for a site with no hiring page", async () => {
    const result = await crawl("/no-careers-page/");

    expect(result.homepage).not.toBeNull();
    expect(result.pages.every((page) => page.hiringScore === 0)).toBe(true);
    expect(urls(result)).toContain("/no-careers-page/about");
  });

  it("returns just the homepage for a near-empty site", async () => {
    const result = await crawl("/thin/");

    expect(result.pages).toHaveLength(1);
    expect(result.skipped).toEqual([]);
  });

  it("reports an unreachable company site rather than throwing", async () => {
    const result = await crawlCompanySite({
      startUrl: "http://127.0.0.1:9/",
      allowPrivateHosts: true,
      politenessMs: 0,
      maxAttempts: 1,
      sleep: async () => {},
    });

    expect(result.homepage).toBeNull();
    expect(result.pages).toEqual([]);
    expect(result.skipped).toHaveLength(1);
  });

  it("reports a 404 homepage rather than throwing", async () => {
    const result = await crawl("/nothing-here/");

    expect(result.homepage).toBeNull();
    expect(result.skipped[0]).toMatchObject({ reason: "HTTP_ERROR" });
  });

  it("reports a malformed company URL", async () => {
    const result = await crawlCompanySite({
      startUrl: "not-a-url",
      allowPrivateHosts: true,
    });

    expect(result.homepage).toBeNull();
    expect(result.skipped[0]?.reason).toBe("BLOCKED_URL");
  });

  it("obeys a robots file that refuses crawlers", async () => {
    const result = await crawl("/blocked/");

    expect(result.homepage).toBeNull();
    expect(result.skipped[0]).toMatchObject({ reason: "DISALLOWED_BY_ROBOTS" });
  });

  it("skips a disallowed page without abandoning the crawl", async () => {
    const result = await crawl("/acme/");

    expect(result.skipped).toContainEqual(
      expect.objectContaining({
        url: `${site.origin}/acme/jobs-archive`,
        reason: "DISALLOWED_BY_ROBOTS",
      }),
    );
    expect(urls(result)).toContain("/acme/hb/2847");
  });
});
