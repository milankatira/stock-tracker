import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { AiService } from "../../ai/ai.service";
import { buildFallbackNarrative } from "../../ai/fallback-narrative";
import { NarrativeAuditFailedError } from "../../ai/ai.types";
import { ReportsService } from "../../reports/reports.service";
import { NarrativeContextProvider } from "./narrative-context.provider";
import {
  NARRATIVE_BATCH_QUEUE_NAME,
  type NarrativeBatchJobData,
  type NarrativeContextBundle,
} from "./narrative-batch.types";

export interface NarrativeProcessResult {
  readonly ticker: string;
  readonly ok?: boolean;
  readonly skipped?: "stale-version";
  readonly fallbackUsed?: boolean;
}

/**
 * BullMQ narrative-batch worker. Allowed to import `AiService`
 * because the COMP-02 ESLint fence carves out `apps/api/src/jobs/**`.
 *
 * Worker rules:
 *  - dataVersionHash drift → return `{ skipped: 'stale-version' }` without calling Gemini.
 *  - `AiService.narrative` audit exhaustion → emit deterministic fallback narrative + `fallbackUsed: true`.
 *  - `ComplianceViolationException` → rethrow so BullMQ retries up to 3 queue-level attempts; final failure lands in the FAILED set (no fallback for compliance breaches).
 *  - SWOT audit exhaustion → empty quadrants persisted; processor still returns `ok: true` because the narrative is the primary surface.
 */
@Processor(NARRATIVE_BATCH_QUEUE_NAME, { concurrency: 4 })
export class NarrativeBatchProcessor extends WorkerHost {
  private readonly logger = new Logger(NarrativeBatchProcessor.name);

  constructor(
    private readonly ai: AiService,
    private readonly reports: ReportsService,
    private readonly contextProvider: NarrativeContextProvider,
  ) {
    super();
  }

  async process(
    job: Job<NarrativeBatchJobData>,
  ): Promise<NarrativeProcessResult> {
    const { ticker, dataVersionHash } = job.data;

    const bundle = await this.contextProvider.forTicker(ticker);
    if (bundle.dataVersionHash !== dataVersionHash) {
      this.logger.log(
        {
          ticker,
          jobHash: dataVersionHash,
          currentHash: bundle.dataVersionHash,
        },
        "narrative_batch_stale_version_skip",
      );
      return { ticker, skipped: "stale-version" };
    }

    const narrative = await this.runNarrative(bundle);
    const swot = await this.runSwot(bundle);

    const generatedAt = new Date().toISOString();
    await this.reports.upsertNarrative(ticker, {
      narrative: {
        paragraph: narrative.text,
        citedSources: narrative.citedSources,
        generatedAt,
        auditPassed: true,
      },
      swot: {
        strengths: swot.strengths,
        weaknesses: swot.weaknesses,
        opportunities: swot.opportunities,
        threats: swot.threats,
        citedSources: swot.citedSources,
        generatedAt,
        auditPassed: true,
      },
      dataVersionHash,
      fallbackUsed: narrative.fallbackUsed,
    });
    await this.reports.bustCache(ticker);

    return { ticker, ok: true, fallbackUsed: narrative.fallbackUsed };
  }

  private async runNarrative(
    bundle: NarrativeContextBundle,
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
            ticker: bundle.ticker,
            dataVersionHash: bundle.dataVersionHash,
            attempts: err.attempts,
          },
          "narrative_audit_exhausted_falling_back",
        );
        const fallback = buildFallbackNarrative(bundle.score, bundle.verdict);
        return {
          text: fallback.text,
          citedSources: fallback.citedSources,
          fallbackUsed: true,
        };
      }
      throw err;
    }
  }

  private async runSwot(bundle: NarrativeContextBundle): Promise<{
    strengths: readonly string[];
    weaknesses: readonly string[];
    opportunities: readonly string[];
    threats: readonly string[];
    citedSources: readonly string[];
  }> {
    try {
      const out = await this.ai.swot(bundle.context);
      return {
        strengths: out.strengths,
        weaknesses: out.weaknesses,
        opportunities: out.opportunities,
        threats: out.threats,
        citedSources: out.citedSources,
      };
    } catch (err) {
      if (err instanceof NarrativeAuditFailedError) {
        this.logger.warn(
          {
            ticker: bundle.ticker,
            dataVersionHash: bundle.dataVersionHash,
            attempts: err.attempts,
          },
          "swot_audit_exhausted_empty_payload",
        );
        return {
          strengths: [],
          weaknesses: [],
          opportunities: [],
          threats: [],
          citedSources: [],
        };
      }
      throw err;
    }
  }
}
