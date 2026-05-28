import { Injectable } from "@nestjs/common";
import { calculateScore, type ScoreInput, type ScoreResult } from "@finsight/shared";
import { createHash } from "node:crypto";
import { MarketDataService, type Quote } from "../market-data/market-data.service";
import { NarrativeService } from "../narrative/narrative.service";

export interface AnalysisReportRequest extends ScoreInput {
  readonly assetName: string;
  readonly assetType: "stock";
  readonly symbol: string;
}

export interface AnalysisReport {
  readonly asset: {
    readonly name: string;
    readonly type: "stock";
    readonly symbol: string;
  };
  readonly quote: Quote;
  readonly score: ScoreResult;
  readonly citations: readonly string[];
  readonly narrative: string;
}

@Injectable()
export class AnalysisReportService {
  constructor(
    private readonly marketData: MarketDataService,
    private readonly narrative: NarrativeService,
  ) {}

  async createStockReport(input: AnalysisReportRequest): Promise<AnalysisReport> {
    const quote = await this.marketData.getStockQuote(input.symbol);
    const score = calculateScore(input);
    const citations = this.buildCitations(quote);
    const narrative = await this.narrative.getNarrative({
      assetName: input.assetName,
      assetType: input.assetType,
      cacheKey: this.narrativeCacheKey(input, quote.symbol, score, citations),
      score,
      citations,
    });

    return {
      asset: {
        name: input.assetName,
        type: input.assetType,
        symbol: quote.symbol,
      },
      quote,
      score,
      citations,
      narrative,
    };
  }

  private buildCitations(quote: Quote): readonly string[] {
    return [
      `${this.formatCitationSource(quote.source)} quote for ${quote.symbol} as of ${quote.asOf}`,
    ];
  }

  private narrativeCacheKey(
    input: AnalysisReportRequest,
    symbol: string,
    score: ScoreResult,
    citations: readonly string[],
  ): string {
    const cardScores = score.insightCards.map((card) => card.score).join(":");
    return [
      input.assetType,
      symbol,
      score.score,
      score.verdict,
      cardScores,
      this.promptInputDigest(input.assetName, citations),
    ].join(":");
  }

  private formatCitationSource(source: string): string {
    if (source === "yahoo-finance") return "Yahoo Finance";
    return source;
  }

  private promptInputDigest(assetName: string, citations: readonly string[]): string {
    return createHash("sha256")
      .update(assetName)
      .update("\n")
      .update(citations.join("\n"))
      .digest("hex")
      .slice(0, 16);
  }
}
