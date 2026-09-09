import type { ExtractedLink } from "./html";

export interface Signal {
  pattern: RegExp;
  weight: number;
  label: string;
}

/**
 * How a company documents its interview loop is not predictable from the URL
 * alone — some publish it under /careers, others inside a public handbook or an
 * engineering blog. Anchor text is therefore scored alongside the path, and a
 * fixed list of paths is never consulted.
 */
export const HIRING_SIGNALS: Signal[] = [
  { pattern: /how[-_ ]?we[-_ ]?hire/, weight: 14, label: "how-we-hire" },
  { pattern: /interview[-_ ]?(process|guide|loop|stages)/, weight: 14, label: "interview-process" },
  { pattern: /hiring[-_ ]?(process|guide)/, weight: 12, label: "hiring-process" },
  { pattern: /\binterview(s|ing)?\b/, weight: 9, label: "interview" },
  { pattern: /\bhiring\b/, weight: 7, label: "hiring" },
  { pattern: /\brecruit(ing|ment)?\b/, weight: 6, label: "recruiting" },
  { pattern: /\bhandbook\b/, weight: 6, label: "handbook" },
  { pattern: /\bcareers?\b/, weight: 6, label: "careers" },
  { pattern: /\bjobs?\b/, weight: 5, label: "jobs" },
  { pattern: /join[-_ ]?(us|the[-_ ]?team)?\b/, weight: 4, label: "join-us" },
  { pattern: /work[-_ ]?(with|for|at)[-_ ]?us/, weight: 4, label: "work-with-us" },
  { pattern: /life[-_ ]?at\b/, weight: 3, label: "life-at" },
  { pattern: /\bculture\b/, weight: 3, label: "culture" },
  { pattern: /\bengineering\b/, weight: 2, label: "engineering" },
];

export const ABOUT_SIGNALS: Signal[] = [
  { pattern: /\babout([-_ ]?us)?\b/, weight: 12, label: "about" },
  { pattern: /what[-_ ]?we[-_ ]?do/, weight: 12, label: "what-we-do" },
  { pattern: /\b(our[-_ ])?(mission|story|values)\b/, weight: 8, label: "mission" },
  { pattern: /\bcompany\b/, weight: 6, label: "company" },
  { pattern: /\bproducts?\b/, weight: 5, label: "product" },
  { pattern: /\bplatform\b/, weight: 4, label: "platform" },
  { pattern: /\bcustomers?\b/, weight: 3, label: "customers" },
  { pattern: /\bteam\b/, weight: 3, label: "team" },
  { pattern: /\bhandbook\b/, weight: 3, label: "handbook" },
];

export const PENALTIES: Signal[] = [
  { pattern: /(log[-_ ]?in|sign[-_ ]?in|sign[-_ ]?up|register|account)/, weight: -14, label: "auth" },
  { pattern: /(privacy|terms|legal|cookie|gdpr|imprint)/, weight: -12, label: "legal" },
  { pattern: /(cart|checkout|pricing|billing|invoice)/, weight: -6, label: "commerce" },
  { pattern: /\.(pdf|zip|png|jpe?g|gif|svg|css|js|xml|ico|woff2?)$/, weight: -20, label: "asset" },
];

export interface ScoredLink extends ExtractedLink {
  hiring: number;
  about: number;
  signals: string[];
}

function pathDepth(path: string): number {
  return path.split("/").filter(Boolean).length;
}

/**
 * A site served under a subpath puts that subpath on every link, so scoring the
 * whole path lets the base leak in as a false signal — a company hosted at
 * /careers-co/ would make every page look like a careers page. Only the part
 * below the base is scored.
 */
export function basePathOf(baseUrl: string): string {
  try {
    const { pathname } = new URL(baseUrl);
    return pathname.endsWith("/") ? pathname : pathname.replace(/[^/]*$/, "");
  } catch {
    return "/";
  }
}

function relativeTo(path: string, basePath: string): string {
  if (basePath === "/" || !path.startsWith(basePath)) return path;
  return path.slice(basePath.length - 1);
}

function applySignals(
  haystack: string,
  signals: readonly Signal[],
  matched: Set<string>,
): number {
  let score = 0;
  for (const signal of signals) {
    if (!signal.pattern.test(haystack)) continue;
    score += signal.weight;
    matched.add(signal.label);
  }
  return score;
}

export function scoreLink(link: ExtractedLink, basePath = "/"): ScoredLink {
  const matched = new Set<string>();

  let url: URL;
  try {
    url = new URL(link.url);
  } catch {
    return { ...link, hiring: 0, about: 0, signals: [] };
  }

  const relative = relativeTo(url.pathname, basePath);
  const path = decodeURIComponent(relative + url.search).toLowerCase();
  const anchor = link.anchorText.toLowerCase();

  const penalty = applySignals(path, PENALTIES, matched);
  const depthPenalty = Math.max(0, pathDepth(relative) - 2);

  const hiring =
    applySignals(path, HIRING_SIGNALS, matched) +
    applySignals(anchor, HIRING_SIGNALS, matched) +
    penalty -
    depthPenalty;

  const about =
    applySignals(path, ABOUT_SIGNALS, matched) +
    applySignals(anchor, ABOUT_SIGNALS, matched) +
    penalty -
    depthPenalty;

  return {
    ...link,
    hiring: Math.max(0, hiring),
    about: Math.max(0, about),
    signals: [...matched],
  };
}

export function sameOrigin(candidate: string, origin: string): boolean {
  try {
    return new URL(candidate).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

export interface RankedLinks {
  hiring: ScoredLink[];
  about: ScoredLink[];
}

/**
 * Ranks same-origin links into the two things the research step is looking for.
 * A link can appear in both lists when it scores on both, which is common for
 * public handbooks.
 */
export function rankLinks(
  links: readonly ExtractedLink[],
  baseUrl: string,
  limitPerCategory: number,
): RankedLinks {
  const basePath = basePathOf(baseUrl);
  const scored = links
    .filter((link) => sameOrigin(link.url, baseUrl))
    .map((link) => scoreLink(link, basePath));

  const take = (key: "hiring" | "about"): ScoredLink[] =>
    scored
      .filter((link) => link[key] > 0)
      .sort((left, right) => right[key] - left[key] || left.url.localeCompare(right.url))
      .slice(0, limitPerCategory);

  return { hiring: take("hiring"), about: take("about") };
}
