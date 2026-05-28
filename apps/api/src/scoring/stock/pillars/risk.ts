import { Decimal } from "../decimal";
import type {
  PeerCohortValues,
  PillarBreakdown,
  ScoreStockRisk,
  ScoreStockShareholding,
} from "../../types";
import type { AbsoluteBand } from "../normalise";
import {
  buildPillarFromSubFactors,
  type SubFactorSpec,
} from "./pillar.utils";

// [ASSUMED] A2 — Risk sub-factor weights per RESEARCH.md.
const W_VOL = new Decimal("0.30");
const W_MDD = new Decimal("0.20");
const W_EC = new Decimal("0.25");
const W_AUDIT = new Decimal("0.15");
const W_PLEDGE_TREND = new Decimal("0.10");

// [ASSUMED] A3 — fallback bands.
const VOL_BANDS: readonly AbsoluteBand[] = [
  { upTo: 0.15, score: 10 },
  { upTo: 0.25, score: 7 },
  { upTo: 0.35, score: 5 },
  { upTo: 0.50, score: 3 },
  { upTo: Number.POSITIVE_INFINITY, score: 0 },
];
const MDD_BANDS: readonly AbsoluteBand[] = [
  { upTo: -0.5, score: 0 },
  { upTo: -0.3, score: 3 },
  { upTo: -0.2, score: 5 },
  { upTo: -0.1, score: 8 },
  { upTo: Number.POSITIVE_INFINITY, score: 10 },
];
const EC_BANDS: readonly AbsoluteBand[] = [
  { upTo: 30, score: 0 },
  { upTo: 50, score: 4 },
  { upTo: 70, score: 7 },
  { upTo: 85, score: 9 },
  { upTo: Number.POSITIVE_INFINITY, score: 10 },
];
const AUDIT_BANDS: readonly AbsoluteBand[] = [
  { upTo: 0, score: 10 },
  { upTo: 1, score: 5 },
  { upTo: 2, score: 2 },
  { upTo: Number.POSITIVE_INFINITY, score: 0 },
];
const PLEDGE_TREND_BANDS: readonly AbsoluteBand[] = [
  { upTo: 0, score: 10 },
  { upTo: 5, score: 6 },
  { upTo: 15, score: 3 },
  { upTo: Number.POSITIVE_INFINITY, score: 0 },
];

/**
 * Risk pillar — 10% of the final stock score. Lower volatility, smaller
 * drawdown (closer to zero), higher earnings consistency, and zero
 * audit qualifications all push the pillar score up.
 */
export function scoreRiskPillar(
  risk: ScoreStockRisk,
  shareholding: ScoreStockShareholding,
  peerCohort: PeerCohortValues,
  weight: Decimal,
): PillarBreakdown {
  const specs: readonly SubFactorSpec[] = [
    spec("volatility1yAnnualised", "risk.volatility1yAnnualised", risk.volatility1yAnnualised, "lower", VOL_BANDS, peerCohort, W_VOL),
    spec("maxDrawdown1y", "risk.maxDrawdown1y", risk.maxDrawdown1y, "higher", MDD_BANDS, peerCohort, W_MDD),
    spec("earningsConsistencyPct", "risk.earningsConsistencyPct", risk.earningsConsistencyPct, "higher", EC_BANDS, peerCohort, W_EC),
    spec("auditQualifications", "risk.auditQualifications", risk.auditQualifications, "lower", AUDIT_BANDS, peerCohort, W_AUDIT),
    spec("pledgedPctTrend90d", "shareholding.pledgedPctTrend90d", shareholding.pledgedPctTrend90d, "lower", PLEDGE_TREND_BANDS, peerCohort, W_PLEDGE_TREND),
  ];
  return buildPillarFromSubFactors("risk", weight, specs);
}

function spec(
  name: string,
  source: string,
  rawValue: number | null,
  direction: "higher" | "lower",
  bands: readonly AbsoluteBand[],
  peerCohort: PeerCohortValues,
  initialWeight: Decimal,
): SubFactorSpec {
  return {
    name,
    source,
    rawValue,
    direction,
    fallbackBands: bands,
    peerValues: peerCohort[source] ?? [],
    initialWeight,
  };
}
