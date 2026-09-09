import { describe, expect, it } from "vitest";
import { CasesFileError, parseCases, parseCasesFile } from "./cases";

const valid = {
  id: "case-01",
  jd: "Senior Backend Engineer",
  company_url: "http://localhost:8099/acme/",
  days: 5,
};

describe("parseCases", () => {
  it("accepts the Appendix B input shape", () => {
    const parsed = parseCases([valid]);

    expect(parsed.valid).toHaveLength(1);
    expect(parsed.invalid).toEqual([]);
  });

  it("keeps unknown fields on a case", () => {
    const parsed = parseCases([{ ...valid, note: "from the brief" }]);

    expect(parsed.valid[0]).toMatchObject({ note: "from the brief" });
  });

  it("separates a malformed case instead of rejecting the file", () => {
    const parsed = parseCases([valid, { id: "case-02", jd: "x", days: 0 }]);

    expect(parsed.valid.map((item) => item.id)).toEqual(["case-01"]);
    expect(parsed.invalid[0]?.id).toBe("case-02");
  });

  it("labels a case that has no usable id", () => {
    const parsed = parseCases([{ jd: "x" }]);

    expect(parsed.invalid[0]?.id).toBe("case-at-index-0");
  });

  it("rejects a duplicate id rather than overwriting a result", () => {
    const parsed = parseCases([valid, { ...valid }]);

    expect(parsed.valid).toHaveLength(1);
    expect(parsed.invalid[0]?.message).toContain("Duplicate case id");
  });

  it("accepts an empty posting, because a thin posting is still a case", () => {
    const parsed = parseCases([{ ...valid, jd: "" }]);

    expect(parsed.valid).toHaveLength(1);
  });

  it("refuses a file that is not an array", () => {
    expect(() => parseCases({ cases: [] })).toThrow(CasesFileError);
  });
});

describe("parseCasesFile", () => {
  it("reports invalid JSON clearly", () => {
    expect(() => parseCasesFile("{ not json")).toThrow(CasesFileError);
  });

  it("parses a well-formed file", () => {
    expect(parseCasesFile(JSON.stringify([valid])).valid).toHaveLength(1);
  });
});
