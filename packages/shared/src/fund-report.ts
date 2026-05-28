import type { Verdict } from "./verdict";
import type { Disclaimers, DataLineageEntry, Narrative } from "./stock-report";

export interface FundReturnsBucket {
  readonly "1y": number;
  readonly "3y": number;
  readonly "5y": number;
  readonly "10y": number;
}

export interface FundReturns {
  readonly fund: FundReturnsBucket;
  readonly benchmark: FundReturnsBucket;
  readonly category: FundReturnsBucket;
}

export interface FundRisk {
  readonly sharpe1y: number;
  readonly stddev1y: number;
  /** Negative number, e.g. -0.18 == -18%. */
  readonly maxDrawdown1y: number;
}

export interface FundHolding {
  readonly name: string;
  readonly weightPct: number;
  readonly sector?: string;
}

export interface FundSectorWeight {
  readonly sector: string;
  readonly weightPct: number;
}

export interface FundMeta {
  readonly expenseRatioPct: number;
  /** Assets under management in Crore INR. */
  readonly aumCr: number;
  readonly managerName: string;
  readonly managerTenureYears: number;
}

export interface FundPeer {
  readonly schemeCode: string;
  readonly name: string;
  readonly score: number;
}

export interface HigherScoringPeer extends FundPeer {
  readonly scoreDelta: number;
}

export interface FundPillars {
  readonly returns: number;
  readonly riskAdjusted: number;
  readonly consistency: number;
  readonly costs: number;
  readonly manager: number;
  readonly portfolio: number;
}

export type FundNarrative = Narrative;

export interface FundReportDoc {
  readonly schemeCode: string;
  readonly name: string;
  readonly category: string;
  readonly asOf: string;
  readonly dataVersionHash: string;
  readonly score: {
    readonly value: number;
    readonly verdict: Verdict;
    readonly pillars: FundPillars;
    readonly weightsVersion: string;
  };
  readonly returns: FundReturns;
  readonly risk: FundRisk;
  readonly holdings: readonly FundHolding[];
  readonly sectorAllocation: readonly FundSectorWeight[];
  readonly meta: FundMeta;
  readonly peers: readonly FundPeer[];
  readonly higherScoringPeers?: readonly HigherScoringPeer[];
  readonly narrative: FundNarrative | null;
  readonly disclaimers: Disclaimers;
  readonly dataLineage: readonly DataLineageEntry[];
}
