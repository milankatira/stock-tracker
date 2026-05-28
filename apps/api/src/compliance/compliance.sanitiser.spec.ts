import { describe, expect, it } from "vitest";
import { sanitiseAndCheck } from "./compliance.sanitiser";
import {
  EVASION_FIXTURES,
  FORBIDDEN_FIXTURES,
  NEUTRAL_FIXTURES,
} from "./compliance.fixtures";

describe("sanitiseAndCheck — forbidden fixtures", () => {
  for (const fixture of FORBIDDEN_FIXTURES) {
    it(`flags forbidden text: ${fixture.slice(0, 60)}`, () => {
      const result = sanitiseAndCheck(fixture);
      expect(result.violations.length).toBeGreaterThan(0);
    });
  }
});

describe("sanitiseAndCheck — neutral fixtures pass", () => {
  for (const fixture of NEUTRAL_FIXTURES) {
    it(`allows neutral text: ${fixture.slice(0, 60)}`, () => {
      const result = sanitiseAndCheck(fixture);
      expect(result.violations).toEqual([]);
    });
  }
});

describe("sanitiseAndCheck — specific rule mappings", () => {
  it("matches the recommend rule on 'We recommend holding'", () => {
    const result = sanitiseAndCheck("We recommend holding the position.");
    expect(result.violations).toContain("verb:buy/sell/hold/recommend");
  });

  it("matches the target-price rule on 'Target price of Rs. 3,200'", () => {
    const result = sanitiseAndCheck("Target price of Rs. 3,200 next year.");
    expect(result.violations).toContain("phrase:target-price");
  });

  it("matches the numeric-rupee rule on '₹2,800'", () => {
    const result = sanitiseAndCheck("Upside to ₹2,800 looks attractive.");
    expect(result.violations).toContain("numeric:rupee-target");
  });

  it("matches the you-should rule on 'You should buy'", () => {
    const result = sanitiseAndCheck("You should buy on every dip.");
    expect(result.violations).toContain("phrase:you-should-X");
  });

  it("treats BUY as the same forbidden token as buy (case-insensitive)", () => {
    const result = sanitiseAndCheck("BUY on weakness.");
    expect(result.violations).toContain("verb:buy/sell/hold/recommend");
  });

  it("does NOT flag 'buyer' (different word)", () => {
    const result = sanitiseAndCheck("A new buyer entered the market.");
    expect(result.violations).toEqual([]);
  });
});

describe("sanitiseAndCheck — known v1 evasions (regression markers)", () => {
  for (const fixture of EVASION_FIXTURES) {
    it(`[ASSUMED A5] currently passes — evasion regression marker: ${fixture.slice(0, 60)}`, () => {
      const result = sanitiseAndCheck(fixture);
      expect(result.violations).toEqual([]);
    });
  }
});

describe("sanitiseAndCheck — edge cases", () => {
  it("returns no violations for empty input", () => {
    expect(sanitiseAndCheck("")).toEqual({
      sanitised: "",
      violations: [],
      matches: [],
    });
  });

  it("preserves the original text in the sanitised field", () => {
    const text = "We recommend buying.";
    const result = sanitiseAndCheck(text);
    expect(result.sanitised).toBe(text);
  });
});
