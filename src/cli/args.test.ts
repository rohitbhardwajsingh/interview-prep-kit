import { describe, expect, it } from "vitest";
import {
  ArgumentError,
  DEFAULT_CASE_TIMEOUT_MS,
  DEFAULT_CONCURRENCY,
  parseEvaluateArgs,
} from "./args";

describe("parseEvaluateArgs", () => {
  it("reads the flags the brief specifies", () => {
    const args = parseEvaluateArgs([
      "--input",
      "cases.json",
      "--output",
      "kits.json",
    ]);

    expect(args.inputPath).toBe("cases.json");
    expect(args.outputPath).toBe("kits.json");
    expect(args.concurrency).toBe(DEFAULT_CONCURRENCY);
    expect(args.caseTimeoutMs).toBe(DEFAULT_CASE_TIMEOUT_MS);
  });

  it("accepts the equals form", () => {
    const args = parseEvaluateArgs(["--input=in.json", "--output=out.json"]);

    expect(args.inputPath).toBe("in.json");
    expect(args.outputPath).toBe("out.json");
  });

  it("prefers a flag over the environment", () => {
    const args = parseEvaluateArgs(
      ["--input", "in.json", "--output", "out.json", "--concurrency", "4"],
      { EVALUATE_CONCURRENCY: "9" },
    );

    expect(args.concurrency).toBe(4);
  });

  it("falls back to the environment", () => {
    const args = parseEvaluateArgs(["--input", "in.json", "--output", "out.json"], {
      EVALUATE_CONCURRENCY: "3",
      CASE_TIMEOUT_MS: "60000",
    });

    expect(args.concurrency).toBe(3);
    expect(args.caseTimeoutMs).toBe(60_000);
  });

  it.each([
    [["--output", "out.json"]],
    [["--input", "in.json"]],
    [[]],
  ])("rejects %j as incomplete", (argv) => {
    expect(() => parseEvaluateArgs(argv)).toThrow(ArgumentError);
  });

  it("rejects a flag with no value", () => {
    expect(() => parseEvaluateArgs(["--input", "--output", "out.json"])).toThrow(
      ArgumentError,
    );
  });

  it.each(["0", "-2", "1.5", "many"])(
    "rejects %s as a concurrency",
    (value) => {
      expect(() =>
        parseEvaluateArgs([
          "--input",
          "in.json",
          "--output",
          "out.json",
          "--concurrency",
          value,
        ]),
      ).toThrow(ArgumentError);
    },
  );
});
