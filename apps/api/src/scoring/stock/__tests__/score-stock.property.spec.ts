import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Decimal } from "../decimal";
import { scoreStock } from "../score-stock";
import { arbScoreStockInput } from "./arbitraries";

const PROPERTY_RUNS = 50;

describe("scoreStock — property tests", () => {
  it("always returns a score in [0, 10]", () => {
    fc.assert(
      fc.property(arbScoreStockInput, (input) => {
        const result = scoreStock(input);
        return result.score >= 0 && result.score <= 10;
      }),
      { numRuns: PROPERTY_RUNS },
    );
  });

  it("reconciles to the sum of weighted pillar contributions (within rounding)", () => {
    fc.assert(
      fc.property(arbScoreStockInput, (input) => {
        const result = scoreStock(input);
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

  it("is referentially transparent — same input yields the same score", () => {
    fc.assert(
      fc.property(arbScoreStockInput, (input) => {
        const a = scoreStock(input);
        const cloned = JSON.parse(JSON.stringify(input)) as typeof input;
        const b = scoreStock(cloned);
        return a.score === b.score && a.verdict === b.verdict;
      }),
      { numRuns: PROPERTY_RUNS },
    );
  });

  it("pillar weights always sum to exactly 1.0000", () => {
    fc.assert(
      fc.property(arbScoreStockInput, (input) => {
        const result = scoreStock(input);
        const sum = result.pillars
          .reduce((acc, p) => acc.plus(p.weight), new Decimal(0))
          .toFixed(4);
        return sum === "1.0000";
      }),
      { numRuns: PROPERTY_RUNS },
    );
  });
});

describe("scoreStock — purity guards", () => {
  it("does not mutate the input object", () => {
    fc.assert(
      fc.property(arbScoreStockInput, (input) => {
        const before = JSON.stringify(input);
        scoreStock(input);
        const after = JSON.stringify(input);
        return before === after;
      }),
      { numRuns: PROPERTY_RUNS },
    );
  });
});
