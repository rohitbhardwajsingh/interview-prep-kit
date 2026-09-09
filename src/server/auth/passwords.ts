import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { ScryptOptions } from "node:crypto";
import { promisify } from "node:util";

/**
 * promisify resolves to scrypt's three-argument overload, which drops the
 * options that carry the cost parameters, so the signature is restated.
 */
const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * scrypt from Node's own crypto, rather than a bcrypt package. It is a
 * memory-hard KDF that OWASP considers acceptable for password storage, and it
 * needs no native build step, so a clean clone installs without a compiler.
 *
 * Cost is the OWASP baseline: 2^15 iterations, block size 8, parallelism 1.
 */
const COST = 2 ** 15;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export const MIN_PASSWORD_LENGTH = 10;

/** Encodes the parameters alongside the hash so the cost can be raised later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELISM,
    // Node refuses scrypt above a default memory ceiling at this cost.
    maxmem: 128 * COST * BLOCK_SIZE * 2,
  });

  return [
    "scrypt",
    COST,
    BLOCK_SIZE,
    PARALLELISM,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/**
 * Always compares in constant time, and treats a malformed stored value as a
 * mismatch rather than an error, so a corrupt row cannot become a bypass.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, costRaw, blockRaw, parallelRaw, saltRaw, hashRaw] = parts;
  const cost = Number(costRaw);
  const blockSize = Number(blockRaw);
  const parallelism = Number(parallelRaw);

  if (!Number.isInteger(cost) || cost < 2) return false;
  if (!Number.isInteger(blockSize) || blockSize < 1) return false;
  if (!Number.isInteger(parallelism) || parallelism < 1) return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(hashRaw ?? "", "base64");
  } catch {
    return false;
  }
  if (expected.length === 0) return false;

  const salt = Buffer.from(saltRaw ?? "", "base64");
  if (salt.length === 0) return false;

  let derived: Buffer;
  try {
    derived = await scryptAsync(password, salt, expected.length, {
      N: cost,
      r: blockSize,
      p: parallelism,
      maxmem: 128 * cost * blockSize * 2,
    });
  } catch {
    return false;
  }

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
