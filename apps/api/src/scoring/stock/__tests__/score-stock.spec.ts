import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Decimal } from "../decimal";
import { scoreStock } from "../score-stock";
import { Verdict, type ScoreStockInput } from "../../types";
import {
  NO_SENTIMENT_DATA_PRE_PHASE_6,
} from "../pillars/sentiment";
import { STOCK_FIXTURES } from "./fixtures";

const PILLAR_ORDER = [
  "fundamentals",
  "valuation",
  "technical",
  "sentiment",
  "risk",
  "event",
] as const;

function canonical(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonical).join(",") + "]";
  }
  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((k) => k !== "_inputHash")
    .sort();
  return (
    "{" +
    keys.map((k) => JSON.stringify(k) + ":" + canonical(record[k])).join(",") +
    "}"
  );
}

describe.each(STOCK_FIXTURES)("scoreStock — fixture $name", ({ input, name }) => {
  it("matches its committed _inputHash", () => {
    const hash = createHash("sha256")
      .update(canonical(input))
      .digest("hex");
    expect(input._inputHash).toBe(hash);
  });

  it(`produces a deterministic ScoreResult snapshot for ${name}`, () => {
    const result = scoreStock(input);
    expect(serialise(result)).toMatchSnapshot();
  });

  it("returns 6 pillars in the canonical order with weights summing to 1", () => {
    const result = scoreStock(input);
    expect(result.pillars.map((p) => p.pillar)).toEqual(PILLAR_ORDER);
    const weightSum = result.pillars
      .reduce((acc, p) => acc.plus(p.weight), new Decimal(0))
      .toFixed(4);
    expect(weightSum).toBe("1.0000");
  });

  it("emits per-pillar sub-factor breakdowns whose contributing weights sum to 1", () => {
    const result = scoreStock(input);
    for (const pillar of result.pillars) {
      if (pillar.isFallback) continue;
      const contributingWeights = pillar.subFactors
        .filter((sf) => !sf.isAbsent && sf.weightWithinPillar.gt(0))
        .reduce(
          (acc, sf) => acc.plus(sf.weightWithinPillar),
          new Decimal(0),
        );
      // Renormalised to 4dp — tolerate 0.0002 rounding drift.
      const drift = contributingWeights.minus(1).abs();
      expect(drift.lte("0.0002")).toBe(true);
    }
  });

  it("respects the always-bounded contract on every sub-factor score", () => {
    const result = scoreStock(input);
    for (const pillar of result.pillars) {
      for (const sf of pillar.subFactors) {
        expect(sf.normalisedScore.gte(0)).toBe(true);
        expect(sf.normalisedScore.lte(10)).toBe(true);
      }
    }
  });
});

describe("scoreStock — sentiment fallback", () => {
  it("emits NO_SENTIMENT_DATA_PRE_PHASE_6 when sentiment input is null", () => {
    const nullSentiment = STOCK_FIXTURES.find(
      ({ input }) => input.sentiment === null,
    );
    expect(nullSentiment).toBeDefined();
    if (!nullSentiment) return;

    const result = scoreStock(nullSentiment.input);
    const sentimentPillar = result.pillars.find((p) => p.pillar === "sentiment");
    expect(sentimentPillar?.isFallback).toBe(true);
    expect(sentimentPillar?.fallbackReason).toBe(NO_SENTIMENT_DATA_PRE_PHASE_6);
    expect(sentimentPillar?.pillarScore.toFixed(4)).toBe("5.0000");
  });
});

describe("scoreStock — verdict mapping", () => {
  it("maps a high-scoring fixture to STRONG_SCORE or CAUTION (never WEAK)", () => {
    const reliance = STOCK_FIXTURES.find((f) => f.name === "RELIANCE");
    if (!reliance) throw new Error("RELIANCE fixture missing");
    const result = scoreStock(reliance.input);
    expect([Verdict.STRONG_SCORE, Verdict.CAUTION]).toContain(result.verdict);
  });
});

interface SerialisedSubFactor {
  readonly name: string;
  readonly source: string;
  readonly rawValue: number | null;
  readonly normalisedScore: string;
  readonly weightWithinPillar: string;
  readonly direction: string;
  readonly isFallback: boolean;
  readonly isAbsent: boolean;
}

interface SerialisedPillar {
  readonly pillar: string;
  readonly pillarScore: string;
  readonly weight: string;
  readonly weightedContribution: string;
  readonly isFallback: boolean;
  readonly fallbackReason: string | null;
  readonly subFactors: readonly SerialisedSubFactor[];
}

interface SerialisedResult {
  readonly score: number;
  readonly verdict: string;
  readonly scoringEngineVersion: string;
  readonly inputHash: string;
  readonly pillars: readonly SerialisedPillar[];
}

function serialise(result: ReturnType<typeof scoreStock>): SerialisedResult {
  return {
    score: result.score,
    verdict: result.verdict,
    scoringEngineVersion: result.scoringEngineVersion,
    inputHash: result.inputHash,
    pillars: result.pillars.map((pillar) => ({
      pillar: pillar.pillar,
      pillarScore: pillar.pillarScore.toFixed(4),
      weight: pillar.weight.toFixed(4),
      weightedContribution: pillar.weightedContribution.toFixed(4),
      isFallback: pillar.isFallback,
      fallbackReason: pillar.fallbackReason ?? null,
      subFactors: pillar.subFactors.map((sf) => ({
        name: sf.name,
        source: sf.source,
        rawValue: roundRaw(sf.rawValue),
        direction: sf.direction,
        normalisedScore: sf.normalisedScore.toFixed(4),
        weightWithinPillar: sf.weightWithinPillar.toFixed(4),
        isFallback: sf.isFallback,
        isAbsent: sf.isAbsent,
      })),
    })),
  };
}

function roundRaw(value: number | null): number | null {
  if (value === null) return null;
  return Number(value.toFixed(6));
}

// Use the input typing only — keeps this module self-contained even when
// the helper above doesn't read it as a Type<> directly.
declare const _ensureScoreStockInput: ScoreStockInput | null;
