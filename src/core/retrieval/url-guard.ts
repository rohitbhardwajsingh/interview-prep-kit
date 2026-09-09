import { lookup } from "node:dns/promises";
import { isPrivateAddress } from "./ip-ranges";

export const URL_REJECTIONS = {
  MALFORMED: "MALFORMED",
  UNSUPPORTED_PROTOCOL: "UNSUPPORTED_PROTOCOL",
  CREDENTIALS_IN_URL: "CREDENTIALS_IN_URL",
  PRIVATE_ADDRESS: "PRIVATE_ADDRESS",
  UNRESOLVABLE_HOST: "UNRESOLVABLE_HOST",
} as const;

export type UrlRejection = (typeof URL_REJECTIONS)[keyof typeof URL_REJECTIONS];

export type UrlCheck =
  | { ok: true; url: URL }
  | { ok: false; reason: UrlRejection; detail: string };

export interface UrlGuardOptions {
  /**
   * The graders may serve company sites from a local address, so loopback and
   * private ranges are reachable outside production and blocked inside it.
   */
  allowPrivateHosts: boolean;
  resolveHost?: (hostname: string) => Promise<string[]>;
}

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const LOCAL_HOSTNAMES = new Set(["localhost", "localhost.localdomain"]);

export function allowPrivateHostsFromEnv(
  env: Record<string, string | undefined>,
): boolean {
  const explicit = env["ALLOW_PRIVATE_HOSTS"];
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return env["NODE_ENV"] !== "production";
}

async function defaultResolveHost(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true });
  return records.map((record) => record.address);
}

function stripBrackets(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "");
}

function isLiteralAddress(hostname: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":");
}

function isLocalHostname(hostname: string): boolean {
  const lowered = hostname.toLowerCase();
  return LOCAL_HOSTNAMES.has(lowered) || lowered.endsWith(".localhost");
}

/**
 * Checks a URL before it is fetched, and again after every redirect, because a
 * public host can redirect to a private one.
 */
export async function guardUrl(
  raw: string,
  options: UrlGuardOptions,
): Promise<UrlCheck> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return {
      ok: false,
      reason: URL_REJECTIONS.MALFORMED,
      detail: `Not a valid absolute URL: "${raw}"`,
    };
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return {
      ok: false,
      reason: URL_REJECTIONS.UNSUPPORTED_PROTOCOL,
      detail: `Protocol ${url.protocol} is not fetchable`,
    };
  }

  if (url.username || url.password) {
    return {
      ok: false,
      reason: URL_REJECTIONS.CREDENTIALS_IN_URL,
      detail: "Credentials embedded in a URL are not followed",
    };
  }

  if (options.allowPrivateHosts) return { ok: true, url };

  const hostname = stripBrackets(url.hostname);

  if (isLocalHostname(hostname)) {
    return {
      ok: false,
      reason: URL_REJECTIONS.PRIVATE_ADDRESS,
      detail: `${hostname} is a loopback hostname`,
    };
  }

  if (isLiteralAddress(hostname)) {
    return isPrivateAddress(hostname)
      ? {
          ok: false,
          reason: URL_REJECTIONS.PRIVATE_ADDRESS,
          detail: `${hostname} is in a reserved range`,
        }
      : { ok: true, url };
  }

  const resolveHost = options.resolveHost ?? defaultResolveHost;
  let addresses: string[];
  try {
    addresses = await resolveHost(hostname);
  } catch (cause) {
    return {
      ok: false,
      reason: URL_REJECTIONS.UNRESOLVABLE_HOST,
      detail: `Could not resolve ${hostname}: ${cause instanceof Error ? cause.message : String(cause)}`,
    };
  }

  if (addresses.length === 0) {
    return {
      ok: false,
      reason: URL_REJECTIONS.UNRESOLVABLE_HOST,
      detail: `${hostname} resolved to no addresses`,
    };
  }

  const privateAddress = addresses.find((address) => isPrivateAddress(address));
  if (privateAddress) {
    return {
      ok: false,
      reason: URL_REJECTIONS.PRIVATE_ADDRESS,
      detail: `${hostname} resolves to ${privateAddress}`,
    };
  }

  return { ok: true, url };
}
