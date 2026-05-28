import type { PeerCohortValues } from "../types";

/**
 * Direct-plan / growth-option mutual fund input. v1 of the scoring
 * engine only scores DIRECT/GROWTH — the runtime guard in `scoreFund`
 * rejects other combinations (A7).
 *
 * `monthlyReturns` is the 60-month series of NAV-derived returns
 * (typically log-returns) snapped to IST business-day closes by the
 * loader. Series shorter than 60 months is allowed — sub-factors that
 * require 5Y windows mark themselves `isAbsent` and the weight is
 * redistributed.
 */
export interface ScoreFundInput {
  readonly instrumentId: string;
  /** `'YYYY-MM-DD'` in IST, business-day snapped. */
  readonly asOfDate: string;
  readonly planType: "DIRECT";
  readonly option: "GROWTH";
  readonly category: string;
  readonly benchmarkSymbol: string;

  readonly returns: {
    readonly fundCagr3y: number | null;
    readonly benchmarkTriCagr3y: number | null;
    readonly categoryMedianCagr3y: number | null;
    readonly fundCagr5y: number | null;
    readonly benchmarkTriCagr5y: number | null;
    readonly categoryMedianCagr5y: number | null;
  };

  /** Monthly returns, oldest → newest. Length ≤ 60 (loader cap). */
  readonly monthlyReturns: readonly number[];
  /** Risk-free rate per month, aligned 1:1 with `monthlyReturns`. */
  readonly riskFreeRateMonthly: readonly number[];
  /** Category median monthly returns, aligned with `monthlyReturns`. */
  readonly categoryMedianMonthlyReturns: readonly number[];
  /** Benchmark (TRI) monthly returns, aligned with `monthlyReturns`. */
  readonly benchmarkMonthlyReturns: readonly number[];

  readonly costs: {
    readonly expenseRatio: number | null;
    readonly categoryMedianExpenseRatio: number | null;
  };

  readonly manager: {
    readonly currentManagerTenureYears: number | null;
    readonly managerMedianCagr3y: number | null;
    readonly managerUniverseMedianCagr3y: readonly number[];
  };

  readonly portfolio: {
    readonly top10HoldingsPctOfAum: number | null;
    readonly sectorTiltAbsolutePct: number | null;
    readonly annualTurnoverPct: number | null;
  };

  readonly peerCohort: PeerCohortValues;
  readonly _inputHash: string;
}
