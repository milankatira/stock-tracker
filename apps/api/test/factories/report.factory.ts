/**
 * Test factory for Report persistence inputs.
 *
 * Returns a fully populated `CreateReportInput`-shaped object so repository
 * specs don't have to hand-roll every field. Pass overrides for the fields
 * the test cares about (owner, symbol, createdAt fields are not part of
 * this factory because Mongo assigns them).
 */
import { randomUUID } from "node:crypto";
import { VERDICTS, type ScoreResult } from "@finsight/shared";

export interface ReportSeed {
  ownerUserId: string;
  status: "queued" | "running" | "completed" | "failed";
  asset: { name: string; type: "stock"; symbol: string };
  quote: {
    symbol: string;
    price: number;
    currency: "INR";
    asOf: string;
    source: string;
  };
  score: ScoreResult;
  citations: string[];
  narrative: string;
  generation: {
    requestHash: string;
    requestedAt: Date;
    completedAt?: Date;
    failedAt?: Date;
    errorCode?: string;
    errorMessage?: string;
  };
}

function defaultScore(): ScoreResult {
  return {
    score: 7,
    verdict: VERDICTS.STRONG_SCORE,
    insightCards: [
      { label: "Valuation", score: 60, weight: 0.2 },
      { label: "Growth", score: 70, weight: 0.2 },
      { label: "Profitability", score: 65, weight: 0.2 },
      { label: "Balance sheet", score: 80, weight: 0.15 },
      { label: "Momentum", score: 55, weight: 0.15 },
      { label: "Risk control", score: 70, weight: 0.1 },
    ],
  };
}

export function makeReportSeed(overrides: Partial<ReportSeed> = {}): ReportSeed {
  const symbol = overrides.asset?.symbol ?? overrides.quote?.symbol ?? "RELIANCE.NS";
  const requestedAt = overrides.generation?.requestedAt ?? new Date();
  return {
    ownerUserId: overrides.ownerUserId ?? `owner-${randomUUID()}`,
    status: overrides.status ?? "completed",
    asset: overrides.asset ?? {
      name: "Reliance Industries",
      type: "stock",
      symbol,
    },
    quote: overrides.quote ?? {
      symbol,
      price: 2500.5,
      currency: "INR",
      asOf: new Date().toISOString(),
      source: "yahoo-finance",
    },
    score: overrides.score ?? defaultScore(),
    citations: overrides.citations ?? [`Yahoo Finance quote for ${symbol}`],
    narrative: overrides.narrative ?? "Solid fundamentals in line with sector peers.",
    generation: {
      requestHash: overrides.generation?.requestHash ?? randomUUID(),
      requestedAt,
      completedAt: overrides.generation?.completedAt ?? new Date(requestedAt.getTime() + 1000),
      failedAt: overrides.generation?.failedAt,
      errorCode: overrides.generation?.errorCode,
      errorMessage: overrides.generation?.errorMessage,
    },
  };
}
