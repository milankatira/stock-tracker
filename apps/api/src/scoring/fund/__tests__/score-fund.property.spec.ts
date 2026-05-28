import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Decimal } from "../decimal";
import { scoreFund } from "../score-fund";
import { arbScoreFundInput } from "./arbitraries";

const PROPERTY_RUNS = 50;

describe("scoreFund — property tests", () => {
  it("always returns a score in [0, 10]", () => {
    fc.assert(
      fc.property(arbScoreFundInput, (input) => {
        const result = scoreFund(input);
        return result.score >= 0 && result.score <= 10;
      }),
      { numRuns: PROPERTY_RUNS },
    );
  });

  it("reconciles to the weighted sum of pillar contributions (within rounding)", () => {
    fc.assert(
      fc.property(arbScoreFundInput, (input) => {
        const result = scoreFund(input);
        const sum = result.pillars.reduce(
          (acc, pillar) => acc.plus(pillar.weightedContribution),
          new Decimal(0),
        );
        const clamped = Decimal.max(0, Decimal.min(10, sum));
        const drift = clamped.toNumber() - result.score;
        return Math.abs(drift) <= 0.1;
      }),
      { numRuns: PROPERTY_RUNS },
    );
  });

  it("is referentially transparent — cloned inputs yield identical scores", () => {
    fc.assert(
      fc.property(arbScoreFundInput, (input) => {
        const a = scoreFund(input);
        const cloned = JSON.parse(JSON.stringify(input)) as typeof input;
        const b = scoreFund(cloned);
        return a.score === b.score && a.verdict === b.verdict;
      }),
      { numRuns: PROPERTY_RUNS },
    );
  });

  it("pillar weights always sum to exactly 1.0000", () => {
    fc.assert(
      fc.property(arbScoreFundInput, (input) => {
        const result = scoreFund(input);
        const sum = result.pillars
          .reduce((acc, p) => acc.plus(p.weight), new Decimal(0))
          .toFixed(4);
        return sum === "1.0000";
      }),
      { numRuns: PROPERTY_RUNS },
    );
  });

  it("does not mutate the input object", () => {
    fc.assert(
      fc.property(arbScoreFundInput, (input) => {
        const before = JSON.stringify(input);
        scoreFund(input);
        return JSON.stringify(input) === before;
      }),
      { numRuns: PROPERTY_RUNS },
    );
  });
});
