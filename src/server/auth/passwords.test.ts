import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./passwords";

// scrypt at the OWASP cost is deliberately slow, so these get a longer budget.
const BUDGET = 20_000;

describe("hashPassword", () => {
  it("accepts the password it produced", async () => {
    const stored = await hashPassword("correct horse battery staple");

    expect(await verifyPassword("correct horse battery staple", stored)).toBe(true);
  }, BUDGET);

  it("rejects a different password", async () => {
    const stored = await hashPassword("correct horse battery staple");

    expect(await verifyPassword("Correct horse battery staple", stored)).toBe(false);
  }, BUDGET);

  it("never stores the password itself", async () => {
    const stored = await hashPassword("hunter2-hunter2");

    expect(stored).not.toContain("hunter2");
  }, BUDGET);

  it("salts, so the same password hashes differently every time", async () => {
    const [a, b] = await Promise.all([
      hashPassword("same-password-twice"),
      hashPassword("same-password-twice"),
    ]);

    expect(a).not.toBe(b);
    expect(await verifyPassword("same-password-twice", a)).toBe(true);
    expect(await verifyPassword("same-password-twice", b)).toBe(true);
  }, BUDGET);

  it("records the parameters so the cost can be raised later", async () => {
    const stored = await hashPassword("parameterised");

    expect(stored.split("$")[0]).toBe("scrypt");
    expect(stored.split("$")).toHaveLength(6);
  }, BUDGET);
});

describe("verifyPassword", () => {
  it("treats a malformed record as a mismatch, not an error", async () => {
    for (const bad of [
      "",
      "not-a-hash",
      "scrypt$16384$8$1$only-five-parts",
      "bcrypt$16384$8$1$c2FsdA==$aGFzaA==",
      "scrypt$0$8$1$c2FsdA==$aGFzaA==",
      "scrypt$16384$8$1$$aGFzaA==",
      "scrypt$16384$8$1$c2FsdA==$",
    ]) {
      await expect(verifyPassword("anything", bad)).resolves.toBe(false);
    }
  }, BUDGET);

  it("rejects an empty password against a real hash", async () => {
    const stored = await hashPassword("a-real-password");

    expect(await verifyPassword("", stored)).toBe(false);
  }, BUDGET);
});
