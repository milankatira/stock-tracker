import { describe, expect, it } from "vitest";
import { NUMERIC_TOKEN, validateCitations } from "../citation-validator";

function cite(data: unknown): { data: unknown; sourceTag: string; asOfDate: Date } {
  return { data, sourceTag: "s1", asOfDate: new Date("2026-05-28") };
}

describe("validateCitations", () => {
  it("passes a cited decimal score", () => {
    expect(validateCitations("The score is 7.2.", [cite({ score: 7.2 })])).toEqual({
      ok: true,
      missing: [],
    });
  });

  it("flags an uncited number when there are no tool results", () => {
    expect(validateCitations("The score is 7.2.", [])).toEqual({
      ok: false,
      missing: ["7.2"],
    });
  });

  it("matches an Indian lakh-format rupee amount (₹ optional in haystack)", () => {
    expect(
      validateCitations("Market cap is ₹1,23,456 Cr.", [cite({ marketCap: "₹1,23,456 Cr" })]).ok,
    ).toBe(true);
  });

  it("matches a percentage against a numeric data field", () => {
    expect(validateCitations("Revenue grew 18%.", [cite({ growth: 18 })]).ok).toBe(true);
  });

  it("matches mixed Cr / % / decimal / rupee tokens", () => {
    const res = validateCitations(
      "AUM is 1.5 Cr and P/E is 7.2x and revenue is ₹1,23,456.",
      [cite({ aum: "1.5 Cr", pe: 7.2, revenue: "₹1,23,456" })],
    );
    expect(res.ok).toBe(true);
  });

  it("flags an orphaned percentage while passing the cited score", () => {
    expect(
      validateCitations("The score is 7.2 and growth is 99%.", [cite({ score: 7.2 })]),
    ).toEqual({ ok: false, missing: ["99%"] });
  });

  it("does NOT flag a date (no decimal/unit token)", () => {
    expect(validateCitations("As of 2026-05-28 the data holds.", []).ok).toBe(true);
  });

  it("does NOT flag a bare standalone integer", () => {
    expect(validateCitations("This is 1 of 3 peers.", []).ok).toBe(true);
  });
});

describe("NUMERIC_TOKEN", () => {
  it.each([
    ["₹1,23,456", "₹1,23,456"],
    ["1.5 Cr", "1.5 Cr"],
    ["2.3 Lakh", "2.3 Lakh"],
    ["7.2%", "7.2%"],
    ["7.2", "7.2"],
  ])("detects %s", (input, expected) => {
    NUMERIC_TOKEN.lastIndex = 0;
    expect(input.match(NUMERIC_TOKEN)).toContain(expected);
  });
});
