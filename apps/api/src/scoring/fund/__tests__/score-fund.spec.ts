import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Decimal } from "../decimal";
import { scoreFund } from "../score-fund";
import type { ScoreFundInput } from "../types";
import { FUND_FIXTURES } from "./fixtures";

const PILLAR_ORDER = [
  "returns",
  "risk-adjusted",
  "consistency",
  "costs",
  "manager",
  "portfolio",
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

describe.each(FUND_FIXTURES)("scoreFund — fixture $name", ({ input, name }) => {
  it("matches its committed _inputHash", () => {
    const hash = createHash("sha256")
      .update(canonical(input))
      .digest("hex");
    expect(input._inputHash).toBe(hash);
  });

  it(`produces a deterministic ScoreResult snapshot for ${name}`, () => {
    const result = scoreFund(input);
    expect(serialise(result)).toMatchSnapshot();
  });

  it("returns 6 pillars in canonical order with weights summing to 1", () => {
    const result = scoreFund(input);
    expect(result.pillars.map((p) => p.pillar)).toEqual(PILLAR_ORDER);
    const sum = result.pillars
      .reduce((acc, p) => acc.plus(p.weight), new Decimal(0))
      .toFixed(4);
    expect(sum).toBe("1.0000");
  });

  it("contributing sub-factor weights inside each non-fallback pillar sum to 1", () => {
    const result = scoreFund(input);
    for (const pillar of result.pillars) {
      if (pillar.isFallback) continue;
      const contributing = pillar.subFactors
        .filter((sf) => !sf.isAbsent && sf.weightWithinPillar.gt(0))
        .reduce(
          (acc, sf) => acc.plus(sf.weightWithinPillar),
          new Decimal(0),
        );
      const drift = contributing.minus(1).abs();
      expect(drift.lte("0.0002")).toBe(true);
    }
  });

  it("every sub-factor score is bounded to [0, 10]", () => {
    const result = scoreFund(input);
    for (const pillar of result.pillars) {
      for (const sf of pillar.subFactors) {
        expect(sf.normalisedScore.gte(0)).toBe(true);
        expect(sf.normalisedScore.lte(10)).toBe(true);
      }
    }
  });
});

describe("scoreFund — DIRECT/GROWTH runtime guard (Assumption A7)", () => {
  const baseline = FUND_FIXTURES[0].input;

  it("throws when planType is not DIRECT", () => {
    const bad = { ...baseline, planType: "REGULAR" } as unknown as ScoreFundInput;
    expect(() => scoreFund(bad)).toThrow(/DIRECT\/GROWTH/);
  });

  it("throws when option is not GROWTH", () => {
    const bad = { ...baseline, option: "IDCW" } as unknown as ScoreFundInput;
    expect(() => scoreFund(bad)).toThrow(/DIRECT\/GROWTH/);
  });
});

interface SerialisedSubFactor {
  readonly name: string;
  readonly source: string;
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

function serialise(result: ReturnType<typeof scoreFund>): SerialisedResult {
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
        direction: sf.direction,
        normalisedScore: sf.normalisedScore.toFixed(4),
        weightWithinPillar: sf.weightWithinPillar.toFixed(4),
        isFallback: sf.isFallback,
        isAbsent: sf.isAbsent,
      })),
    })),
  };
}
