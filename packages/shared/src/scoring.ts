import { VERDICTS, type Verdict } from "./verdict";

export interface ScoreInput {
  readonly valuation: number;
  readonly growth: number;
  readonly profitability: number;
  readonly balanceSheet: number;
  readonly momentum: number;
  readonly risk: number;
}

export interface InsightCard {
  readonly label: string;
  readonly score: number;
  readonly weight: number;
}

export interface ScoreResult {
  readonly score: number;
  readonly verdict: Verdict;
  readonly insightCards: readonly InsightCard[];
}

const WEIGHTS = {
  valuation: 0.2,
  growth: 0.2,
  profitability: 0.2,
  balanceSheet: 0.15,
  momentum: 0.15,
  riskControl: 0.1,
} as const;

export function normalizeMetric(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function calculateScore(input: ScoreInput): ScoreResult {
  const insightCards: readonly InsightCard[] = [
    { label: "Valuation", score: normalizeMetric(input.valuation), weight: WEIGHTS.valuation },
    { label: "Growth", score: normalizeMetric(input.growth), weight: WEIGHTS.growth },
    {
      label: "Profitability",
      score: normalizeMetric(input.profitability),
      weight: WEIGHTS.profitability,
    },
    {
      label: "Balance sheet",
      score: normalizeMetric(input.balanceSheet),
      weight: WEIGHTS.balanceSheet,
    },
    { label: "Momentum", score: normalizeMetric(input.momentum), weight: WEIGHTS.momentum },
    {
      label: "Risk control",
      score: normalizeMetric(100 - input.risk),
      weight: WEIGHTS.riskControl,
    },
  ];
  const weightedScore = insightCards.reduce(
    (sum, card) => sum + card.score * card.weight,
    0,
  );
  const score = Math.min(10, Math.max(1, Math.round(weightedScore / 10)));

  return {
    score,
    verdict: verdictForScore(score),
    insightCards,
  };
}

function verdictForScore(score: number): Verdict {
  if (score >= 7) return VERDICTS.STRONG_SCORE;
  if (score <= 4) return VERDICTS.WEAK_SCORE;
  return VERDICTS.CAUTION;
}
