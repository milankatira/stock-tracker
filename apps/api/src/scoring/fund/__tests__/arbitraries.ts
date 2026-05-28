import fc from "fast-check";
import type { ScoreFundInput } from "../types";

const optionalNumber = (min: number, max: number) =>
  fc.option(fc.double({ min, max, noNaN: true, noDefaultInfinity: true }), {
    nil: null,
    freq: 6,
  });

const monthlyArray = (length: number) =>
  fc.array(fc.double({ min: -0.2, max: 0.2, noNaN: true, noDefaultInfinity: true }), {
    minLength: length,
    maxLength: length,
  });

const peerArray = (min: number, max: number) =>
  fc.array(fc.double({ min, max, noNaN: true, noDefaultInfinity: true }), {
    minLength: 0,
    maxLength: 40,
  });

const arbLength = fc.integer({ min: 0, max: 60 });

export const arbScoreFundInput: fc.Arbitrary<ScoreFundInput> = arbLength.chain(
  (length) =>
    fc.record({
      instrumentId: fc.string({ minLength: 1, maxLength: 12 }),
      asOfDate: fc.constant("2026-05-27"),
      planType: fc.constant("DIRECT"),
      option: fc.constant("GROWTH"),
      category: fc.constant("EQUITY_FLEXICAP"),
      benchmarkSymbol: fc.constant("NIFTY_500_TRI"),
      returns: fc.record({
        fundCagr3y: optionalNumber(-30, 50),
        benchmarkTriCagr3y: optionalNumber(-30, 30),
        categoryMedianCagr3y: optionalNumber(-30, 30),
        fundCagr5y: optionalNumber(-30, 50),
        benchmarkTriCagr5y: optionalNumber(-30, 30),
        categoryMedianCagr5y: optionalNumber(-30, 30),
      }),
      monthlyReturns: monthlyArray(length),
      riskFreeRateMonthly: monthlyArray(length),
      categoryMedianMonthlyReturns: monthlyArray(length),
      benchmarkMonthlyReturns: monthlyArray(length),
      costs: fc.record({
        expenseRatio: optionalNumber(0, 3),
        categoryMedianExpenseRatio: optionalNumber(0, 3),
      }),
      manager: fc.record({
        currentManagerTenureYears: optionalNumber(0, 25),
        managerMedianCagr3y: optionalNumber(-20, 40),
        managerUniverseMedianCagr3y: peerArray(-20, 40),
      }),
      portfolio: fc.record({
        top10HoldingsPctOfAum: optionalNumber(5, 95),
        sectorTiltAbsolutePct: optionalNumber(0, 50),
        annualTurnoverPct: optionalNumber(0, 300),
      }),
      peerCohort: fc.record({
        "returns.fundExcess3yVsBenchmark": peerArray(-20, 20),
        "returns.fundExcess3yVsCategory": peerArray(-20, 20),
        "returns.fundExcess5yVsBenchmark": peerArray(-20, 20),
        "returns.fundExcess5yVsCategory": peerArray(-20, 20),
        "risk.sharpe3y": peerArray(-2, 3),
        "risk.sortino3y": peerArray(-2, 3),
        "costs.expenseRatio": peerArray(0, 3),
        "manager.medianCagr3yExcess": peerArray(-20, 20),
      }),
      _inputHash: fc.constant(""),
    }) as unknown as fc.Arbitrary<ScoreFundInput>,
);
