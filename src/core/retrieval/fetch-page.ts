import { guardUrl } from "./url-guard";

export const FETCH_FAILURES = {
  BLOCKED_URL: "BLOCKED_URL",
  HTTP_ERROR: "HTTP_ERROR",
  UNSUPPORTED_CONTENT_TYPE: "UNSUPPORTED_CONTENT_TYPE",
  TOO_LARGE: "TOO_LARGE",
  TIMEOUT: "TIMEOUT",
  NETWORK: "NETWORK",
  TOO_MANY_REDIRECTS: "TOO_MANY_REDIRECTS",
} as const;

export type FetchFailure = (typeof FETCH_FAILURES)[keyof typeof FETCH_FAILURES];

export interface FetchedPage {
  /** The URL the body actually came from, after any redirects. */
  url: string;
  status: number;
  contentType: string;
  body: string;
}

export type FetchOutcome =
  | { ok: true; page: FetchedPage }
  | { ok: false; url: string; reason: FetchFailure; detail: string };

export const DEFAULT_USER_AGENT =
  "prepkit-bot/0.1 (interview prep kit research)";

export const DEFAULT_MAX_BYTES = 2_000_000;
export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_MAX_REDIRECTS = 5;
export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_BACKOFF_MS = 500;

const FETCHABLE_CONTENT_TYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "text/plain",
]);

export interface FetchPageOptions {
  allowPrivateHosts: boolean;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  maxAttempts?: number;
  backoffMs?: number;
  userAgent?: string;
  resolveHost?: (hostname: string) => Promise<string[]>;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function contentTypeOf(response: Response): string {
  return (response.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
}

function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

function backoffFor(attempt: number, base: number): number {
  return base * 2 ** (attempt - 1) + Math.floor(Math.random() * base);
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function readCapped(
  response: Response,
  maxBytes: number,
): Promise<string | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;

  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

/**
 * Fetches one page and reports why it could not be fetched rather than
 * throwing, so a single bad source is skipped instead of ending the run. Every
 * redirect hop is re-checked against the URL guard, because a public host can
 * redirect into a private range.
 */
export async function fetchPage(
  startUrl: string,
  options: FetchPageOptions,
): Promise<FetchOutcome> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_BYTES,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    backoffMs = DEFAULT_BACKOFF_MS,
    userAgent = DEFAULT_USER_AGENT,
    fetchImpl = fetch,
    sleep = defaultSleep,
  } = options;

  let currentUrl = startUrl;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const guard = await guardUrl(currentUrl, {
      allowPrivateHosts: options.allowPrivateHosts,
      ...(options.resolveHost ? { resolveHost: options.resolveHost } : {}),
    });

    if (!guard.ok) {
      return {
        ok: false,
        url: currentUrl,
        reason: FETCH_FAILURES.BLOCKED_URL,
        detail: guard.detail,
      };
    }

    const target = guard.url.toString();
    let response: Response | null = null;
    let lastFailure: { reason: FetchFailure; detail: string } | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const candidate = await fetchImpl(target, {
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
          headers: { "user-agent": userAgent, accept: "text/html,text/plain" },
        });

        if (isRetryableStatus(candidate.status) && attempt < maxAttempts) {
          lastFailure = {
            reason: FETCH_FAILURES.HTTP_ERROR,
            detail: `HTTP ${candidate.status}`,
          };
          await sleep(retryAfterMs(candidate) ?? backoffFor(attempt, backoffMs));
          continue;
        }

        response = candidate;
        break;
      } catch (cause) {
        const timedOut =
          cause instanceof Error &&
          (cause.name === "TimeoutError" || cause.name === "AbortError");
        lastFailure = {
          reason: timedOut ? FETCH_FAILURES.TIMEOUT : FETCH_FAILURES.NETWORK,
          detail: cause instanceof Error ? cause.message : String(cause),
        };
        if (attempt < maxAttempts) {
          await sleep(backoffFor(attempt, backoffMs));
        }
      }
    }

    if (!response) {
      return {
        ok: false,
        url: target,
        reason: lastFailure?.reason ?? FETCH_FAILURES.NETWORK,
        detail: lastFailure?.detail ?? "Request failed",
      };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        return {
          ok: false,
          url: target,
          reason: FETCH_FAILURES.HTTP_ERROR,
          detail: `HTTP ${response.status} with no location header`,
        };
      }
      currentUrl = new URL(location, target).toString();
      continue;
    }

    if (!response.ok) {
      return {
        ok: false,
        url: target,
        reason: FETCH_FAILURES.HTTP_ERROR,
        detail: `HTTP ${response.status}`,
      };
    }

    const contentType = contentTypeOf(response);
    if (!FETCHABLE_CONTENT_TYPES.has(contentType)) {
      await response.body?.cancel();
      return {
        ok: false,
        url: target,
        reason: FETCH_FAILURES.UNSUPPORTED_CONTENT_TYPE,
        detail: `Content type ${contentType || "unknown"} is not processed`,
      };
    }

    const body = await readCapped(response, maxBytes);
    if (body === null) {
      return {
        ok: false,
        url: target,
        reason: FETCH_FAILURES.TOO_LARGE,
        detail: `Body exceeded ${maxBytes} bytes`,
      };
    }

    return {
      ok: true,
      page: { url: target, status: response.status, contentType, body },
    };
  }

  return {
    ok: false,
    url: currentUrl,
    reason: FETCH_FAILURES.TOO_MANY_REDIRECTS,
    detail: `Exceeded ${maxRedirects} redirects`,
  };
}
