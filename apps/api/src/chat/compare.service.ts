import { Injectable, Logger } from "@nestjs/common";
import type { ComparisonVerdict, PendingScoreResponse } from "@finsight/shared";
import { AiService } from "../ai/ai.service";
import type { CompareScoreContext } from "../ai/prompts/compare-system.prompt";
import { ReportsService } from "../reports/reports.service";

/**
 * Comparison orchestrator (STOCK-07). Owns the deterministic score-loading
 * step so `AiService.compare` stays pure (Gemini call only): for each input
 * symbol it reads the persisted FinSight Score via `ReportsService.getStock`
 * — mirroring how `ChatService` builds a `ToolContext` for the decoupled
 * `AiService`. This keeps `AiModule` free of read-path module dependencies
 * (COMP-02 chokepoint preserved).
 *
 * If ANY symbol has no persisted score yet (freshly-added instrument
 * awaiting the next nightly recompute), it short-circuits to a
 * `PendingScoreResponse` which the controller surfaces as HTTP 422 — the
 * model is never called for an incomplete comparison.
 */
@Injectable()
export class CompareService {
  private readonly logger = new Logger(CompareService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly reports: ReportsService,
  ) {}

  async compare(
    symbols: readonly string[],
  ): Promise<ComparisonVerdict | PendingScoreResponse> {
    const scores: CompareScoreContext[] = [];

    for (const symbol of symbols) {
      const doc = await this.reports.getStock(symbol);
      if (!doc) {
        // SCORE_PENDING — surface the first symbol that has no score yet.
        return { error: "SCORE_PENDING", symbol };
      }
      scores.push({
        symbol,
        value: doc.score.value,
        verdict: String(doc.score.verdict),
        pillars: doc.score.pillars as unknown as Record<string, number>,
        asOfDate: doc.asOf,
      });
    }

    return this.aiService.compare(scores);
  }
}
