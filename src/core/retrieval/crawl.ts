import { extractPage } from "./html";
import { fetchPage, type FetchPageOptions } from "./fetch-page";
import {
  basePathOf,
  rankLinks,
  sameOrigin,
  scoreLink,
  type ScoredLink,
} from "./link-scoring";
import { ALLOW_EVERYTHING, parseRobots, type RobotsRules } from "./robots";

export const DEFAULT_MAX_PAGES = 8;
export const DEFAULT_CANDIDATES_PER_CATEGORY = 5;
export const DEFAULT_MAX_DEPTH = 2;
export const DEFAULT_POLITENESS_MS = 200;
export const ROBOTS_USER_AGENT = "prepkit-bot";

export interface CrawledPage {
  url: string;
  title: string;
  text: string;
  hiringScore: number;
  aboutScore: number;
  depth: number;
}

export interface SkippedSource {
  url: string;
  reason: string;
  detail: string;
}

export interface CrawlResult {
  origin: string;
  homepage: CrawledPage | null;
  pages: CrawledPage[];
  skipped: SkippedSource[];
  robotsFound: boolean;
}

export interface CrawlCompanyOptions {
  startUrl: string;
  allowPrivateHosts: boolean;
  maxPages?: number;
  candidatesPerCategory?: number;
  maxDepth?: number;
  politenessMs?: number;
  userAgent?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  maxBytes?: number;
  resolveHost?: (hostname: string) => Promise<string[]>;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

interface Candidate extends ScoredLink {
  depth: number;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchOptionsFrom(options: CrawlCompanyOptions): FetchPageOptions {
  return {
    allowPrivateHosts: options.allowPrivateHosts,
    timeoutMs: options.timeoutMs,
    maxBytes: options.maxBytes,
    maxAttempts: options.maxAttempts,
    userAgent: options.userAgent,
    resolveHost: options.resolveHost,
    fetchImpl: options.fetchImpl,
    sleep: options.sleep,
  };
}

async function loadRobots(
  origin: string,
  options: CrawlCompanyOptions,
): Promise<{ rules: RobotsRules; found: boolean }> {
  const outcome = await fetchPage(`${origin}/robots.txt`, {
    ...fetchOptionsFrom(options),
    maxAttempts: 1,
  });

  if (!outcome.ok) return { rules: ALLOW_EVERYTHING, found: false };
  return { rules: parseRobots(outcome.page.body, ROBOTS_USER_AGENT), found: true };
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "/";
  }
}

/**
 * Walks a company site looking for two things: what they do, and how they hire.
 * Candidates are ranked by link scoring rather than guessed from a fixed list
 * of paths, and only the hiring search goes a second hop deep, because that is
 * the page companies bury.
 */
export async function crawlCompanySite(
  options: CrawlCompanyOptions,
): Promise<CrawlResult> {
  const {
    startUrl,
    maxPages = DEFAULT_MAX_PAGES,
    candidatesPerCategory = DEFAULT_CANDIDATES_PER_CATEGORY,
    maxDepth = DEFAULT_MAX_DEPTH,
    politenessMs = DEFAULT_POLITENESS_MS,
    sleep = defaultSleep,
  } = options;

  const skipped: SkippedSource[] = [];
  const pages: CrawledPage[] = [];
  const visited = new Set<string>();
  const basePath = basePathOf(startUrl);

  let origin: string;
  try {
    origin = new URL(startUrl).origin;
  } catch {
    skipped.push({
      url: startUrl,
      reason: "BLOCKED_URL",
      detail: `Not a valid absolute URL: "${startUrl}"`,
    });
    return { origin: startUrl, homepage: null, pages, skipped, robotsFound: false };
  }

  const { rules, found: robotsFound } = await loadRobots(origin, options);
  const crawlDelay = Math.max(politenessMs, rules.crawlDelayMs ?? 0);

  async function visit(
    candidate: Candidate,
  ): Promise<{ page: CrawledPage; links: ScoredLink[] } | null> {
    if (visited.has(candidate.url)) return null;
    visited.add(candidate.url);

    if (!rules.isAllowed(pathnameOf(candidate.url))) {
      skipped.push({
        url: candidate.url,
        reason: "DISALLOWED_BY_ROBOTS",
        detail: "robots.txt disallows this path",
      });
      return null;
    }

    if (pages.length > 0 && crawlDelay > 0) await sleep(crawlDelay);

    const outcome = await fetchPage(candidate.url, fetchOptionsFrom(options));
    if (!outcome.ok) {
      skipped.push({
        url: candidate.url,
        reason: outcome.reason,
        detail: outcome.detail,
      });
      return null;
    }

    visited.add(outcome.page.url);
    const extracted = extractPage(outcome.page.body, outcome.page.url);
    const page: CrawledPage = {
      url: outcome.page.url,
      title: extracted.title,
      text: extracted.text,
      hiringScore: candidate.hiring,
      aboutScore: candidate.about,
      depth: candidate.depth,
    };
    pages.push(page);

    const links = extracted.links
      .filter((link) => sameOrigin(link.url, origin))
      .map((link) => scoreLink(link, basePath));

    return { page, links };
  }

  const homeVisit = await visit({
    url: startUrl,
    anchorText: "",
    hiring: 0,
    about: 0,
    signals: [],
    depth: 0,
  });

  if (!homeVisit) {
    return { origin, homepage: null, pages, skipped, robotsFound };
  }

  async function walk(
    seeds: readonly ScoredLink[],
    key: "hiring" | "about",
    budget: number,
    expandTo: number,
  ): Promise<void> {
    const frontier: Candidate[] = seeds.map((link) => ({ ...link, depth: 1 }));
    let spent = 0;

    while (spent < budget && frontier.length > 0 && pages.length < maxPages) {
      frontier.sort(
        (left, right) => right[key] - left[key] || left.depth - right.depth,
      );
      const next = frontier.shift();
      if (!next || visited.has(next.url)) continue;

      const result = await visit(next);
      spent += 1;
      if (!result || next.depth >= expandTo) continue;

      for (const link of result.links) {
        if (link[key] <= 0 || visited.has(link.url)) continue;
        frontier.push({ ...link, depth: next.depth + 1 });
      }
    }
  }

  const ranked = rankLinks(homeVisit.links, startUrl, candidatesPerCategory);
  const remaining = Math.max(0, maxPages - pages.length);
  const hiringBudget = Math.ceil(remaining * 0.6);

  await walk(ranked.hiring, "hiring", hiringBudget, maxDepth);
  await walk(ranked.about, "about", maxPages - pages.length, 1);

  return { origin, homepage: homeVisit.page, pages, skipped, robotsFound };
}
