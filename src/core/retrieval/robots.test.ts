import { describe, expect, it } from "vitest";
import { parseRobots } from "./robots";

const AGENT = "prepkit-bot";

describe("parseRobots", () => {
  it("allows everything when the file is empty", () => {
    const rules = parseRobots("", AGENT);

    expect(rules.isAllowed("/careers")).toBe(true);
  });

  it("honours a blanket disallow", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /", AGENT);

    expect(rules.isAllowed("/careers")).toBe(false);
  });

  it("allows a path carved out of a disallowed prefix", () => {
    const rules = parseRobots(
      "User-agent: *\nDisallow: /private\nAllow: /private/careers",
      AGENT,
    );

    expect(rules.isAllowed("/private/salaries")).toBe(false);
    expect(rules.isAllowed("/private/careers")).toBe(true);
  });

  it("prefers a group naming our agent over the wildcard group", () => {
    const rules = parseRobots(
      `User-agent: *\nDisallow: /\n\nUser-agent: ${AGENT}\nDisallow: /admin`,
      AGENT,
    );

    expect(rules.isAllowed("/careers")).toBe(true);
    expect(rules.isAllowed("/admin")).toBe(false);
  });

  it("applies a group that lists several agents together", () => {
    const rules = parseRobots(
      `User-agent: other-bot\nUser-agent: ${AGENT}\nDisallow: /secret`,
      AGENT,
    );

    expect(rules.isAllowed("/secret")).toBe(false);
  });

  it("understands wildcards inside a pattern", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /*/draft", AGENT);

    expect(rules.isAllowed("/handbook/draft")).toBe(false);
    expect(rules.isAllowed("/handbook/hiring")).toBe(true);
  });

  it("understands an end-anchored pattern", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /*.pdf$", AGENT);

    expect(rules.isAllowed("/brochure.pdf")).toBe(false);
    expect(rules.isAllowed("/brochure.pdf.html")).toBe(true);
  });

  it("ignores comments and blank lines", () => {
    const rules = parseRobots(
      "# our robots file\n\nUser-agent: *   # everyone\nDisallow: /admin\n",
      AGENT,
    );

    expect(rules.isAllowed("/admin")).toBe(false);
    expect(rules.isAllowed("/careers")).toBe(true);
  });

  it("treats an empty disallow value as permission", () => {
    const rules = parseRobots("User-agent: *\nDisallow:", AGENT);

    expect(rules.isAllowed("/anything")).toBe(true);
  });

  it("reads a crawl delay in milliseconds", () => {
    expect(parseRobots("User-agent: *\nCrawl-delay: 1.5", AGENT).crawlDelayMs).toBe(
      1500,
    );
    expect(parseRobots("User-agent: *\nDisallow:", AGENT).crawlDelayMs).toBeNull();
  });
});
