import { Decimal } from "../decimal";
import type {
  PeerCohortValues,
  PillarBreakdown,
  ScoreStockFundamentals,
  ScoreStockShareholding,
} from "../../types";
import type { AbsoluteBand } from "../normalise";
import {
  buildPillarFromSubFactors,
  equalWeights,
  type SubFactorSpec,
} from "./pillar.utils";

// [ASSUMED] A3 — fallback bands per RESEARCH.md tables, conservative defaults.
const ROE_BANDS: readonly AbsoluteBand[] = [
  { upTo: 5, score: 0 },
  { upTo: 12, score: 4 },
  { upTo: 18, score: 7 },
  { upTo: 25, score: 9 },
  { upTo: Number.POSITIVE_INFINITY, score: 10 },
];
const ROCE_BANDS = ROE_BANDS;
const DE_BANDS: readonly AbsoluteBand[] = [
  { upTo: 0.3, score: 10 },
  { upTo: 0.7, score: 8 },
  { upTo: 1.2, score: 5 },
  { upTo: 2.0, score: 3 },
  { upTo: Number.POSITIVE_INFINITY, score: 0 },
];
const REV_CAGR_BANDS: readonly AbsoluteBand[] = [
  { upTo: 0, score: 0 },
  { upTo: 8, score: 4 },
  { upTo: 14, score: 7 },
  { upTo: 22, score: 9 },
  { upTo: Number.POSITIVE_INFINITY, score: 10 },
];
const PROFIT_CAGR_BANDS = REV_CAGR_BANDS;
const OPM_BANDS: readonly AbsoluteBand[] = [
  { upTo: 5, score: 2 },
  { upTo: 12, score: 5 },
  { upTo: 20, score: 7 },
  { upTo: 30, score: 9 },
  { upTo: Number.POSITIVE_INFINITY, score: 10 },
];
const PROMOTER_BANDS: readonly AbsoluteBand[] = [
  { upTo: 25, score: 3 },
  { upTo: 45, score: 6 },
  { upTo: 70, score: 9 },
  { upTo: Number.POSITIVE_INFINITY, score: 10 },
];
const PLEDGE_BANDS: readonly AbsoluteBand[] = [
  { upTo: 1, score: 10 },
  { upTo: 5, score: 7 },
  { upTo: 25, score: 4 },
  { upTo: Number.POSITIVE_INFINITY, score: 0 },
];

const W = equalWeights(8);

/**
 * Fundamentals pillar — 35% of the final stock score, 8 equal-weight
 * sub-factors. Absent sub-factors are excluded and the remaining
 * weights renormalised; when all 8 are absent the pillar emits 5.0.
 */
export function scoreFundamentalsPillar(
  fundamentals: ScoreStockFundamentals,
  shareholding: ScoreStockShareholding,
  peerCohort: PeerCohortValues,
  weight: Decimal,
): PillarBreakdown {
  const specs: readonly SubFactorSpec[] = [
    spec("roeTtm", "fundamentals.roeTtm", fundamentals.roeTtm, "higher", ROE_BANDS, peerCohort),
    spec("roceTtm", "fundamentals.roceTtm", fundamentals.roceTtm, "higher", ROCE_BANDS, peerCohort),
    spec("debtToEquity", "fundamentals.debtToEquity", fundamentals.debtToEquity, "lower", DE_BANDS, peerCohort),
    spec("revenueCagr3y", "fundamentals.revenueCagr3y", fundamentals.revenueCagr3y, "higher", REV_CAGR_BANDS, peerCohort),
    spec("profitCagr3y", "fundamentals.profitCagr3y", fundamentals.profitCagr3y, "higher", PROFIT_CAGR_BANDS, peerCohort),
    spec("opMarginTtm", "fundamentals.opMarginTtm", fundamentals.opMarginTtm, "higher", OPM_BANDS, peerCohort),
    spec("promoterPct", "shareholding.promoterPct", shareholding.promoterPct, "higher", PROMOTER_BANDS, peerCohort),
    spec("pledgedPctOfPromoter", "shareholding.pledgedPctOfPromoter", shareholding.pledgedPctOfPromoter, "lower", PLEDGE_BANDS, peerCohort),
  ];
  return buildPillarFromSubFactors("fundamentals", weight, specs);
}

function spec(
  name: string,
  source: string,
  rawValue: number | null,
  direction: "higher" | "lower",
  bands: readonly AbsoluteBand[],
  peerCohort: PeerCohortValues,
): SubFactorSpec {
  return {
    name,
    source,
    rawValue,
    direction,
    fallbackBands: bands,
    peerValues: peerCohort[source] ?? [],
    initialWeight: W,
  };
}
