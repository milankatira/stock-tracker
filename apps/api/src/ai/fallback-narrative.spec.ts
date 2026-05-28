import { describe, expect, it } from "vitest";
import { sanitiseAndCheck } from "../compliance/compliance.sanitiser";
import {
  FALLBACK_TEMPLATE,
  buildFallbackNarrative,
} from "./fallback-narrative";

describe("buildFallbackNarrative", () => {
  it("renders STRONG_SCORE as 'Strong Score' (no BSH verbs)", () => {
    const result = buildFallbackNarrative(7, "STRONG_SCORE");
    expect(result.text).toBe("FinSight Score: 7. Verdict: Strong Score.");
    expect(result.citedSources).toEqual(["score"]);
    expect(result.touchesReturns).toBe(false);
  });

  it("renders CAUTION verdict copy verbatim", () => {
    expect(buildFallbackNarrative(5, "CAUTION").text).toContain(
      "Verdict: Caution",
    );
  });

  it("renders WEAK_SCORE as 'Weak Score' (never 'Sell')", () => {
    const result = buildFallbackNarrative(3, "WEAK_SCORE");
    expect(result.text).toContain("Verdict: Weak Score");
    expect(result.text.toLowerCase()).not.toContain("sell");
  });

  it("passes the compliance sanitiser cleanly for every verdict", () => {
    for (const verdict of ["STRONG_SCORE", "CAUTION", "WEAK_SCORE"] as const) {
      const fallback = buildFallbackNarrative(6, verdict);
      const audit = sanitiseAndCheck(fallback.text);
      expect(audit.violations).toEqual([]);
    }
  });

  it("exposes the placeholder template for documentation reuse", () => {
    expect(FALLBACK_TEMPLATE).toBe(
      "FinSight Score: {{score}}. Verdict: {{verdict}}.",
    );
  });
});
