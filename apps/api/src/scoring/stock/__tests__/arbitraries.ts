import fc from "fast-check";
import type { ScoreStockInput } from "../../types";

const optionalNumber = (min: number, max: number) =>
  fc.option(fc.double({ min, max, noNaN: true, noDefaultInfinity: true }), {
    nil: null,
    freq: 6,
  });

const peerArray = (min: number, max: number) =>
  fc.array(fc.double({ min, max, noNaN: true, noDefaultInfinity: true }), {
    minLength: 0,
    maxLength: 40,
  });

export const arbScoreStockInput: fc.Arbitrary<ScoreStockInput> = fc.record({
  instrumentId: fc.string({ minLength: 1, maxLength: 12 }),
  asOfDate: fc.constant("2026-05-27"),
  fundamentals: fc.record({
    roeTtm: optionalNumber(-30, 60),
    roceTtm: optionalNumber(-30, 70),
    debtToEquity: optionalNumber(0, 8),
    revenueCagr3y: optionalNumber(-30, 50),
    profitCagr3y: optionalNumber(-50, 60),
    opMarginTtm: optionalNumber(-20, 50),
  }),
  shareholding: fc.record({
    promoterPct: optionalNumber(0, 90),
    pledgedPctOfPromoter: optionalNumber(0, 100),
    pledgedPctTrend90d: optionalNumber(-30, 30),
  }),
  valuation: fc.record({
    peTtm: optionalNumber(2, 80),
    pb: optionalNumber(0.2, 15),
    peg: optionalNumber(0.1, 5),
    evEbitda: optionalNumber(2, 40),
    divYield: optionalNumber(0, 8),
  }),
  sectorMedians: fc.record({ pe: optionalNumber(5, 60) }),
  technical: fc.record({
    price: fc.float({ min: 10, max: 100000, noNaN: true }),
    sma50: optionalNumber(10, 100000),
    sma200: optionalNumber(10, 100000),
    rsi14: optionalNumber(0, 100),
    macd: fc.option(
      fc.record({
        macd: fc.float({ min: -50, max: 50, noNaN: true }),
        signal: fc.float({ min: -50, max: 50, noNaN: true }),
      }),
      { nil: null },
    ),
    bollinger: fc.option(
      fc.record({
        upper: fc.float({ min: 11, max: 100001, noNaN: true }),
        lower: fc.float({ min: 9, max: 99999, noNaN: true }),
      }),
      { nil: null },
    ),
    return1yVsNifty: optionalNumber(-1, 2),
    return3yVsNifty: optionalNumber(-1, 5),
    beta: optionalNumber(0.1, 3),
  }),
  sentiment: fc.option(
    fc.record({
      last30dAggregate: optionalNumber(0, 10),
      analystConsensus: optionalNumber(0, 10),
    }),
    { nil: null, freq: 3 },
  ),
  risk: fc.record({
    volatility1yAnnualised: optionalNumber(0.05, 1),
    maxDrawdown1y: optionalNumber(-0.95, 0),
    earningsConsistencyPct: optionalNumber(0, 100),
    auditQualifications: optionalNumber(0, 5),
  }),
  event: fc.record({
    meanAbsReturnResults5: optionalNumber(0, 15),
    meanAbsReturnDividends5: optionalNumber(0, 10),
    meanAbsReturnSectorNews5: optionalNumber(0, 10),
  }),
  peerCohort: fc.record({
    "fundamentals.roeTtm": peerArray(-30, 60),
    "fundamentals.roceTtm": peerArray(-30, 70),
    "fundamentals.debtToEquity": peerArray(0, 8),
    "fundamentals.revenueCagr3y": peerArray(-30, 50),
    "fundamentals.profitCagr3y": peerArray(-50, 60),
    "fundamentals.opMarginTtm": peerArray(-20, 50),
    "valuation.peTtm": peerArray(2, 80),
    "valuation.pb": peerArray(0.2, 15),
    "valuation.peg": peerArray(0.1, 5),
    "valuation.evEbitda": peerArray(2, 40),
    "valuation.divYield": peerArray(0, 8),
    "risk.volatility1yAnnualised": peerArray(0.05, 1),
    "risk.maxDrawdown1y": peerArray(-0.95, 0),
    "risk.earningsConsistencyPct": peerArray(0, 100),
    "shareholding.promoterPct": peerArray(0, 90),
    "shareholding.pledgedPctOfPromoter": peerArray(0, 100),
  }),
  _inputHash: fc.constant(""),
}) as unknown as fc.Arbitrary<ScoreStockInput>;
