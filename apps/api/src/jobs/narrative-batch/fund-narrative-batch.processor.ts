import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { AiService } from "../../ai/ai.service";
import { buildFallbackNarrative } from "../../ai/fallback-narrative";
import { NarrativeAuditFailedError } from "../../ai/ai.types";
import { FundReportsService } from "../../reports/fund-reports.service";
import { FundNarrativeContextProvider } from "./fund-narrative-context.provider";
import {
  FUND_NARRATIVE_BATCH_QUEUE_NAME,
  type FundNarrativeBatchJobData,
  type FundNarrativeContextBundle,
} from "./fund-narrative-batch.types";

export interface FundNarrativeProcessResult {
  readonly schemeCode: string;
  readonly ok?: boolean;
  readonly skipped?: "stale-version";
  readonly fallbackUsed?: boolean;
}

/**
 * BullMQ worker for fund narratives. Allowed to import AiService
 * because the COMP-02 ESLint fence carves out `apps/api/src/jobs/**`.
 *
 * Mirrors `NarrativeBatchProcessor` (stocks) with two deltas:
 *   - persists via `FundReportsService.upsertNarrative` (no SWOT — fund
 *     reports do not expose SWOT in v1; commentary is a v1.1 add).
 *   - fallback narrative uses `assetClass: 'fund'` so the prefix reads
 *     "FinSight Fund Score" not "FinSight Score".
 */
@Processor(FUND_NARRATIVE_BATCH_QUEUE_NAME, { concurrency: 4 })
export class FundNarrativeBatchProcessor extends WorkerHost {
  private readonly logger = new Logger(FundNarrativeBatchProcessor.name);

  constructor(
    private readonly ai: AiService,
    private readonly reports: FundReportsService,
    private readonly contextProvider: FundNarrativeContextProvider,
  ) {
    super();
  }

  async process(
    job: Job<FundNarrativeBatchJobData>,
  ): Promise<FundNarrativeProcessResult> {
    const { schemeCode, dataVersionHash } = job.data;

    const bundle = await this.contextProvider.forFund(schemeCode);
    if (bundle.dataVersionHash !== dataVersionHash) {
      this.logger.log(
        {
          schemeCode,
          jobHash: dataVersionHash,
          currentHash: bundle.dataVersionHash,
        },
        "fund_narrative_batch_stale_version_skip",
      );
      return { schemeCode, skipped: "stale-version" };
    }

    const narrative = await this.runNarrative(bundle);

    await this.reports.upsertNarrative(schemeCode, {
      narrative: {
        paragraph: narrative.text,
        citedSources: narrative.citedSources,
        generatedAt: new Date().toISOString(),
        auditPassed: true,
      },
      dataVersionHash,
      fallbackUsed: narrative.fallbackUsed,
    });

    return {
      schemeCode,
      ok: true,
      fallbackUsed: narrative.fallbackUsed,
    };
  }

  private async runNarrative(
    bundle: FundNarrativeContextBundle,
  ): Promise<{ text: string; citedSources: readonly string[]; fallbackUsed: boolean }> {
    try {
      const out = await this.ai.narrative(bundle.context);
      return {
        text: out.text,
        citedSources: out.citedSources,
        fallbackUsed: false,
      };
    } catch (err) {
      if (err instanceof NarrativeAuditFailedError) {
        this.logger.warn(
          {
            schemeCode: bundle.schemeCode,
            dataVersionHash: bundle.dataVersionHash,
            attempts: err.attempts,
          },
          "fund_narrative_audit_exhausted_falling_back",
        );
        const fallback = buildFallbackNarrative(
          bundle.score,
          bundle.verdict,
          "fund",
        );
        return {
          text: fallback.text,
          citedSources: fallback.citedSources,
          fallbackUsed: true,
        };
      }
      throw err;
    }
  }
}
