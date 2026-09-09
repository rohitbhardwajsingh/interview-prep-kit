import { describe, expect, it } from "vitest";
import { parseJsonLoosely } from "./json";

describe("parseJsonLoosely", () => {
  it("parses clean JSON", () => {
    expect(parseJsonLoosely('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses an array at the top level", () => {
    expect(parseJsonLoosely("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("strips a fenced code block", () => {
    expect(parseJsonLoosely('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonLoosely('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("ignores prose around the payload", () => {
    expect(
      parseJsonLoosely('Here is the result:\n{"a":1}\nLet me know if that helps.'),
    ).toEqual({ a: 1 });
  });

  it("tolerates a trailing comma", () => {
    expect(parseJsonLoosely('{"a":1,"b":[2,3,],}')).toEqual({ a: 1, b: [2, 3] });
  });

  it("does not stop at a brace inside a string", () => {
    expect(parseJsonLoosely('{"a":"} not the end","b":2}')).toEqual({
      a: "} not the end",
      b: 2,
    });
  });

  it("does not stop at an escaped quote", () => {
    expect(parseJsonLoosely('{"a":"say \\"hi\\" }","b":2}')).toEqual({
      a: 'say "hi" }',
      b: 2,
    });
  });

  it("handles nested structures", () => {
    expect(parseJsonLoosely('prefix {"a":{"b":[{"c":1}]}} suffix')).toEqual({
      a: { b: [{ c: 1 }] },
    });
  });

  it("throws when there is no JSON to find", () => {
    expect(() => parseJsonLoosely("I cannot help with that.")).toThrow(SyntaxError);
    expect(() => parseJsonLoosely("")).toThrow(SyntaxError);
  });

  it("throws on a truncated payload", () => {
    expect(() => parseJsonLoosely('{"a":1,"b":')).toThrow(SyntaxError);
  });
});
