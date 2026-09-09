import { describe, expect, it } from "vitest";
import { rankLinks, sameOrigin, scoreLink } from "./link-scoring";

const origin = "https://acme.test";

function link(url: string, anchorText = "") {
  return { url, anchorText };
}

describe("scoreLink", () => {
  it("ranks a handbook page above a generic careers page when the anchor says so", () => {
    const handbook = scoreLink(
      link("https://acme.test/handbook/company/interviewing/", "How we hire"),
    );
    const careers = scoreLink(link("https://acme.test/careers", "Careers"));

    expect(handbook.hiring).toBeGreaterThan(careers.hiring);
  });

  it("finds a hiring page at a path no fixed list would contain", () => {
    const scored = scoreLink(link("https://acme.test/hb/2847", "Interview process"));

    expect(scored.hiring).toBeGreaterThan(0);
    expect(scored.signals).toContain("interview-process");
  });

  it("separates what-they-do pages from how-they-hire pages", () => {
    const about = scoreLink(link("https://acme.test/about-us", "About us"));

    expect(about.about).toBeGreaterThan(about.hiring);
  });

  it("scores a public handbook on both axes", () => {
    const scored = scoreLink(link("https://acme.test/handbook", "Handbook"));

    expect(scored.hiring).toBeGreaterThan(0);
    expect(scored.about).toBeGreaterThan(0);
  });

  it.each([
    "https://acme.test/login",
    "https://acme.test/privacy-policy",
    "https://acme.test/terms",
  ])("refuses to spend a fetch on %s", (url) => {
    const scored = scoreLink(link(url, "Careers"));

    expect(scored.hiring).toBe(0);
  });

  it("ignores assets that happen to sit under a careers path", () => {
    const scored = scoreLink(link("https://acme.test/careers/brochure.pdf", "Careers"));

    expect(scored.hiring).toBe(0);
  });

  it("prefers a shallower path when signals are otherwise equal", () => {
    const shallow = scoreLink(link("https://acme.test/careers", "Careers"));
    const deep = scoreLink(
      link("https://acme.test/en/gb/corporate/careers", "Careers"),
    );

    expect(shallow.hiring).toBeGreaterThan(deep.hiring);
  });

  it("scores a link it cannot parse as zero rather than throwing", () => {
    expect(scoreLink(link("::::", "Careers")).hiring).toBe(0);
  });
});

describe("sameOrigin", () => {
  it("accepts the same origin and rejects everything else", () => {
    expect(sameOrigin("https://acme.test/careers", origin)).toBe(true);
    expect(sameOrigin("https://blog.acme.test/careers", origin)).toBe(false);
    expect(sameOrigin("http://acme.test/careers", origin)).toBe(false);
  });

  it("treats a local origin like any other", () => {
    expect(
      sameOrigin("http://localhost:8099/acme/careers", "http://localhost:8099/acme/"),
    ).toBe(true);
  });
});

describe("rankLinks", () => {
  const links = [
    link("https://acme.test/careers", "Careers"),
    link("https://acme.test/handbook/hiring", "How we hire"),
    link("https://acme.test/about", "About"),
    link("https://acme.test/login", "Log in"),
    link("https://elsewhere.test/careers", "Careers"),
  ];

  it("keeps only same-origin candidates", () => {
    const ranked = rankLinks(links, origin, 10);

    for (const candidate of [...ranked.hiring, ...ranked.about]) {
      expect(candidate.url.startsWith(origin)).toBe(true);
    }
  });

  it("puts the strongest hiring candidate first", () => {
    expect(rankLinks(links, origin, 10).hiring[0]?.url).toBe(
      "https://acme.test/handbook/hiring",
    );
  });

  it("drops candidates that scored nothing", () => {
    const ranked = rankLinks(links, origin, 10);

    expect(ranked.hiring.map((item) => item.url)).not.toContain(
      "https://acme.test/login",
    );
  });

  it("honours the fetch budget", () => {
    expect(rankLinks(links, origin, 1).hiring).toHaveLength(1);
  });

  it("returns empty lists for a site with no useful links", () => {
    const ranked = rankLinks([link("https://acme.test/privacy", "Privacy")], origin, 5);

    expect(ranked.hiring).toEqual([]);
    expect(ranked.about).toEqual([]);
  });
});
