import { createHmac } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import type { StockReportDoc } from "@finsight/shared";
import {
  ANALYSIS_DISCLAIMER,
  PAST_PERF_DISCLAIMER,
} from "../compliance/disclaimers.constants";
import { CacheService } from "../modules/cache/cache.service";
import {
  StockReportDocEntity,
  type StockReportDocDocument,
} from "./schemas/stock-report-doc.schema";

export interface UpsertNarrativePayload {
  readonly narrative: {
    readonly paragraph: string;
    readonly citedSources: readonly string[];
    readonly generatedAt: string;
    readonly auditPassed: true;
  };
  readonly swot: {
    readonly strengths: readonly string[];
    readonly weaknesses: readonly string[];
    readonly opportunities: readonly string[];
    readonly threats: readonly string[];
    readonly citedSources: readonly string[];
    readonly generatedAt: string;
    readonly auditPassed: true;
  };
  readonly dataVersionHash: string;
  readonly fallbackUsed?: boolean;
}

const REDIS_KEY_TTL_SECONDS = 60 * 60 * 24;
const REVALIDATE_PATH = "/api/internal/revalidate";

/**
 * Materialised read path for the stock report. `getStock` reads Redis
 * first, then Mongo (and re-warms the cache); it NEVER calls AiService
 * or Phase-3 scoring — the EOD job is responsible for keeping the doc
 * fresh.
 *
 * `upsertNarrative` is the persistence target of Plan 04-02's
 * narrative-batch processor. `bustCache` deletes the Redis key and
 * POSTs an HMAC-signed revalidate webhook to the web app (Plan 04-04
 * receiver); failures are logged but never thrown — the durable Mongo
 * doc is the source of truth.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly cache: CacheService,
    @InjectModel(StockReportDocEntity.name)
    private readonly model: Model<StockReportDocDocument>,
    private readonly config: ConfigService,
  ) {}

  async getStock(ticker: string): Promise<StockReportDoc | null> {
    const key = this.redisKey(ticker);
    const cached = await this.cache.get<StockReportDoc>(key);
    if (cached) return this.withDisclaimers(cached);

    const doc = await this.model.findOne({ ticker }).lean().exec();
    if (!doc) return null;
    const payload = this.toReportDoc(doc as unknown as Record<string, unknown>);
    await this.cache.set(key, payload, REDIS_KEY_TTL_SECONDS);
    return this.withDisclaimers(payload);
  }

  async upsertNarrative(
    ticker: string,
    payload: UpsertNarrativePayload,
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.model
      .updateOne(
        { ticker },
        {
          $set: {
            narrative: payload.narrative,
            "insights.swot": payload.swot,
            dataVersionHash: payload.dataVersionHash,
            asOf: now,
            fallbackUsed: payload.fallbackUsed ?? false,
          },
        },
        { upsert: true },
      )
      .exec();
    await this.bustCache(ticker);
  }

  async bustCache(ticker: string): Promise<void> {
    try {
      await this.cache.del(this.redisKey(ticker));
    } catch (err) {
      this.logger.warn(
        { ticker, message: this.errorMessage(err) },
        "report_cache_del_failed",
      );
    }
    await this.fireRevalidateWebhook(ticker);
  }

  /** Visible for testing — pure mapper from the Mongo lean doc to the wire shape. */
  toReportDoc(raw: Record<string, unknown>): StockReportDoc {
    return raw as unknown as StockReportDoc;
  }

  private withDisclaimers(doc: StockReportDoc): StockReportDoc {
    const touchesReturns = Boolean(doc.narrative); // a populated narrative may reference returns; default to attaching the past-perf disclaimer when narrative exists.
    return {
      ...doc,
      disclaimers: {
        analysis: ANALYSIS_DISCLAIMER,
        pastPerformance: touchesReturns ? PAST_PERF_DISCLAIMER : undefined,
      },
    };
  }

  private redisKey(ticker: string): string {
    return `report:stock:${ticker}`;
  }

  private async fireRevalidateWebhook(ticker: string): Promise<void> {
    const secret = this.config.get<string>("REVALIDATE_HMAC_SECRET");
    const base = this.config.get<string>("REVALIDATE_WEBHOOK_URL");
    if (!secret || !base) {
      this.logger.warn(
        { ticker },
        "revalidate_webhook_skipped_missing_config",
      );
      return;
    }
    const tag = `stock:${ticker}`;
    const hmac = createHmac("sha256", secret).update(tag).digest("hex");
    try {
      const response = await fetch(`${base}${REVALIDATE_PATH}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-revalidate-hmac": hmac,
        },
        body: JSON.stringify({ tag }),
      });
      if (!response.ok) {
        this.logger.warn(
          { ticker, status: response.status },
          "revalidate_webhook_non_2xx",
        );
      }
    } catch (err) {
      this.logger.warn(
        { ticker, message: this.errorMessage(err) },
        "revalidate_webhook_failed",
      );
    }
  }

  private errorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    return "unknown";
  }
}
