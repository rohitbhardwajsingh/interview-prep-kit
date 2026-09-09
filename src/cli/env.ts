import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

/**
 * Loads `.env` when there is one. The brief has whoever runs this supply their
 * own key, and a gitignored `.env` is where it belongs, so the batch command
 * has to read one on a clean clone. A missing file is normal, not an error:
 * the key may equally arrive from the real environment.
 */
export function loadDotEnv(cwd = process.cwd()): void {
  const path = resolve(cwd, ".env");
  if (!existsSync(path)) return;
  // Never overrides a variable already set, so an explicit env wins.
  config({ path, override: false, quiet: true });
}
