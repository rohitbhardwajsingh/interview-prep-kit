export interface RobotsRules {
  isAllowed(pathname: string): boolean;
  crawlDelayMs: number | null;
}

interface Rule {
  pattern: string;
  allow: boolean;
}

export const ALLOW_EVERYTHING: RobotsRules = {
  isAllowed: () => true,
  crawlDelayMs: null,
};

function matchLength(pattern: string, pathname: string): number | null {
  if (pattern === "") return null;

  const anchoredEnd = pattern.endsWith("$");
  const body = anchoredEnd ? pattern.slice(0, -1) : pattern;
  const segments = body.split("*");

  let cursor = 0;
  for (const [index, segment] of segments.entries()) {
    if (segment === "") continue;

    if (index === 0) {
      if (!pathname.startsWith(segment)) return null;
      cursor = segment.length;
      continue;
    }

    const found = pathname.indexOf(segment, cursor);
    if (found === -1) return null;
    cursor = found + segment.length;
  }

  if (anchoredEnd && cursor !== pathname.length) return null;
  return body.replace(/\*/g, "").length;
}

/**
 * Longest matching rule wins, and an Allow of equal length beats a Disallow —
 * the behaviour the major crawlers converged on.
 */
function decide(rules: readonly Rule[], pathname: string): boolean {
  let bestLength = -1;
  let bestAllow = true;

  for (const rule of rules) {
    const length = matchLength(rule.pattern, pathname);
    if (length === null) continue;
    if (length > bestLength || (length === bestLength && rule.allow)) {
      bestLength = length;
      bestAllow = rule.allow;
    }
  }

  return bestLength === -1 ? true : bestAllow;
}

export function parseRobots(text: string, userAgent: string): RobotsRules {
  const wanted = userAgent.toLowerCase();
  const groups = new Map<string, Rule[]>();
  const delays = new Map<string, number>();

  let activeAgents: string[] = [];
  let previousLineWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]?.trim() ?? "";
    if (line === "") continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      if (!previousLineWasAgent) activeAgents = [];
      activeAgents.push(value.toLowerCase());
      previousLineWasAgent = true;
      continue;
    }

    previousLineWasAgent = false;
    if (activeAgents.length === 0) continue;

    for (const agent of activeAgents) {
      if (field === "allow" || field === "disallow") {
        const rules = groups.get(agent) ?? [];
        rules.push({ pattern: value, allow: field === "allow" });
        groups.set(agent, rules);
      } else if (field === "crawl-delay") {
        const seconds = Number(value);
        if (Number.isFinite(seconds) && seconds >= 0) delays.set(agent, seconds);
      }
    }
  }

  const agentKey = groups.has(wanted) || delays.has(wanted) ? wanted : "*";
  const rules = groups.get(agentKey) ?? [];
  const delaySeconds = delays.get(agentKey);

  return {
    isAllowed: (pathname: string) => decide(rules, pathname || "/"),
    crawlDelayMs: delaySeconds === undefined ? null : Math.round(delaySeconds * 1000),
  };
}
