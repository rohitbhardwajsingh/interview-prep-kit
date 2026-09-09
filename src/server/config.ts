export interface ServerConfig {
  port: number;
  mongoUrl: string;
  mongoDb: string;
  webOrigin: string;
  sessionSecret: string;
  isProduction: boolean;
}

export class ConfigError extends Error {
  override name = "ConfigError";
}

function required(
  env: Record<string, string | undefined>,
  name: string,
): string {
  const value = env[name]?.trim();
  if (!value) throw new ConfigError(`${name} must be set`);
  return value;
}

const INSECURE_SECRETS = new Set([
  "dev-only-not-a-real-secret",
  "secret",
  "changeme",
]);

export function readServerConfig(
  env: Record<string, string | undefined>,
): ServerConfig {
  const isProduction = env["NODE_ENV"] === "production";
  const sessionSecret = required(env, "SESSION_SECRET");

  // A shared development secret in production would let anyone forge a session
  // cookie, so it fails at boot rather than serving traffic that looks fine.
  if (isProduction && INSECURE_SECRETS.has(sessionSecret)) {
    throw new ConfigError(
      "SESSION_SECRET is still the development default; set a real one",
    );
  }

  const port = Number(env["PORT"] ?? 4000);
  if (!Number.isInteger(port) || port <= 0) {
    throw new ConfigError(`PORT must be a positive integer, got "${env["PORT"]}"`);
  }

  return {
    port,
    mongoUrl: env["MONGO_URL"] ?? "mongodb://127.0.0.1:27017",
    mongoDb: env["MONGO_DB"] ?? "prepkit",
    webOrigin: env["WEB_ORIGIN"] ?? "http://localhost:3000",
    sessionSecret,
    isProduction,
  };
}
