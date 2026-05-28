import { Decimal } from "../decimal";
import type {
  PeerCohortValues,
  PillarBreakdown,
  ScoreStockValuation,
} from "../../types";
import type { AbsoluteBand } from "../normalise";
import {
  buildPillarFromSubFactors,
  equalWeights,
  type SubFactorSpec,
} from "./pillar.utils";

// [ASSUMED] A3 — fallback bands per RESEARCH.md tables.
const PE_BANDS: readonly AbsoluteBand[] = [
  { upTo: 12, score: 10 },
  { upTo: 22, score: 7 },
  { upTo: 35, score: 4 },
  { upTo: Number.POSITIVE_INFINITY, score: 1 },
];
const PB_BANDS: readonly AbsoluteBand[] = [
  { upTo: 1, score: 10 },
  { upTo: 3, score: 7 },
  { upTo: 6, score: 4 },
  { upTo: Number.POSITIVE_INFINITY, score: 1 },
];
const PEG_BANDS: readonly AbsoluteBand[] = [
  { upTo: 0.8, score: 10 },
  { upTo: 1.4, score: 7 },
  { upTo: 2.2, score: 4 },
  { upTo: Number.POSITIVE_INFINITY, score: 1 },
];
const EVEB_BANDS: readonly AbsoluteBand[] = [
  { upTo: 8, score: 10 },
  { upTo: 14, score: 7 },
  { upTo: 22, score: 4 },
  { upTo: Number.POSITIVE_INFINITY, score: 1 },
];
const YIELD_BANDS: readonly AbsoluteBand[] = [
  { upTo: 0.5, score: 2 },
  { upTo: 1.5, score: 5 },
  { upTo: 3, score: 8 },
  { upTo: Number.POSITIVE_INFINITY, score: 10 },
];

const W = equalWeights(5);

/** Valuation pillar — 20% weight, 5 equal-weight sub-factors. */
export function scoreValuationPillar(
  valuation: ScoreStockValuation,
  peerCohort: PeerCohortValues,
  weight: Decimal,
): PillarBreakdown {
  const specs: readonly SubFactorSpec[] = [
    spec("peTtm", "valuation.peTtm", valuation.peTtm, "lower", PE_BANDS, peerCohort),
    spec("pb", "valuation.pb", valuation.pb, "lower", PB_BANDS, peerCohort),
    spec("peg", "valuation.peg", valuation.peg, "lower", PEG_BANDS, peerCohort),
    spec("evEbitda", "valuation.evEbitda", valuation.evEbitda, "lower", EVEB_BANDS, peerCohort),
    spec("divYield", "valuation.divYield", valuation.divYield, "higher", YIELD_BANDS, peerCohort),
  ];
  return buildPillarFromSubFactors("valuation", weight, specs);
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
