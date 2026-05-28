import { describe, expect, it } from "vitest";
import { auditNumbers } from "./numeric-audit";

describe("auditNumbers", () => {
  it("accepts a suffixed token that matches a verified value", () => {
    const result = auditNumbers("ROE stood at 13.7% this period.", {
      roe: "13.7%",
    });
    expect(result).toEqual({ ok: true, unexpectedTokens: [] });
  });

  it("accepts the un-suffixed form when the verified value is suffixed", () => {
    const result = auditNumbers("ROE stood at 13.7 this period.", {
      roe: "13.7%",
    });
    expect(result).toEqual({ ok: true, unexpectedTokens: [] });
  });

  it("flags a fabricated number not in the verified set", () => {
    const result = auditNumbers("Around 14% this period.", { roe: "13.7%" });
    expect(result.ok).toBe(false);
    expect(result.unexpectedTokens).toContain("14%");
  });

  it("flags a fabricated currency token", () => {
    const result = auditNumbers("Trades near Rs. 3,200 today.", {});
    expect(result.ok).toBe(false);
    expect(result.unexpectedTokens.length).toBeGreaterThan(0);
  });

  it("returns ok for empty narrative", () => {
    expect(auditNumbers("", { roe: "13.7%" })).toEqual({
      ok: true,
      unexpectedTokens: [],
    });
  });

  it("accepts negative percentage matches", () => {
    const result = auditNumbers("Down -5.2% year on year.", { chg: "-5.2%" });
    expect(result).toEqual({ ok: true, unexpectedTokens: [] });
  });

  it("ignores comma-separated thousands by canonicalising", () => {
    const result = auditNumbers("Market cap of 1500 crore.", {
      marketCap: "1,500",
    });
    expect(result.ok).toBe(true);
  });
});
