import { createHmac } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import type { FundReportDoc, HigherScoringPeer } from "@finsight/shared";
import {
  ANALYSIS_DISCLAIMER,
  PAST_PERF_DISCLAIMER,
} from "../compliance/disclaimers.constants";
import { CacheService } from "../modules/cache/cache.service";
import { FundPeerSetService } from "./fund-peer-set.service";
import {
  FundReportDocEntity,
  type FundReportDocDocument,
} from "./schemas/fund-report-doc.schema";

export interface UpsertFundNarrativePayload {
  readonly narrative: {
    readonly paragraph: string;
    readonly citedSources: readonly string[];
    readonly generatedAt: string;
    readonly auditPassed: true;
  };
  readonly dataVersionHash: string;
  readonly fallbackUsed?: boolean;
}

const REDIS_KEY_TTL_SECONDS = 60 * 60 * 24;
const REVALIDATE_PATH = "/api/internal/revalidate";
const HIGHER_SCORING_THRESHOLD = 6;

/**
 * Materialised read path for the fund report. Parallel to
 * `ReportsService` (stock) but:
 *
 *   - past-performance disclaimer is **always** attached because the
 *     payload unconditionally exposes the returns view (FUND-02);
 *   - when `score.value < 6`, the response is augmented with the
 *     top-3 higher-scoring peers in the same category. The shape of
 *     the augmentation is precomputed via FundPeerSetService.
 */
@Injectable()
export class FundReportsService {
  private readonly logger = new Logger(FundReportsService.name);

  constructor(
    private readonly cache: CacheService,
    @InjectModel(FundReportDocEntity.name)
    private readonly model: Model<FundReportDocDocument>,
    private readonly config: ConfigService,
    private readonly peers: FundPeerSetService,
  ) {}

  async getFund(schemeCode: string): Promise<FundReportDoc | null> {
    const key = this.redisKey(schemeCode);
    const cached = await this.cache.get<FundReportDoc>(key);
    if (cached) return this.augment(cached);

    const doc = await this.model.findOne({ schemeCode }).lean().exec();
    if (!doc) return null;
    const payload = this.toReportDoc(doc as unknown as Record<string, unknown>);
    await this.cache.set(key, payload, REDIS_KEY_TTL_SECONDS);
    return this.augment(payload);
  }

  async upsertNarrative(
    schemeCode: string,
    payload: UpsertFundNarrativePayload,
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.model
      .updateOne(
        { schemeCode },
        {
          $set: {
            narrative: payload.narrative,
            dataVersionHash: payload.dataVersionHash,
            asOf: now,
            fallbackUsed: payload.fallbackUsed ?? false,
          },
        },
        { upsert: true },
      )
      .exec();
    await this.bustCache(schemeCode);
  }

  async bustCache(schemeCode: string): Promise<void> {
    try {
      await this.cache.del(this.redisKey(schemeCode));
    } catch (err) {
      this.logger.warn(
        { schemeCode, message: this.errorMessage(err) },
        "fund_report_cache_del_failed",
      );
    }
    await this.fireRevalidateWebhook(schemeCode);
  }

  toReportDoc(raw: Record<string, unknown>): FundReportDoc {
    return raw as unknown as FundReportDoc;
  }

  private async augment(doc: FundReportDoc): Promise<FundReportDoc> {
    let higher: readonly HigherScoringPeer[] | undefined;
    if (doc.score.value < HIGHER_SCORING_THRESHOLD) {
      const found = await this.peers.getHigherScoringPeers(doc.schemeCode);
      if (found.length > 0) higher = found;
    }
    return {
      ...doc,
      disclaimers: {
        analysis: ANALYSIS_DISCLAIMER,
        pastPerformance: PAST_PERF_DISCLAIMER,
      },
      ...(higher ? { higherScoringPeers: higher } : {}),
    };
  }

  private redisKey(schemeCode: string): string {
    return `report:fund:${schemeCode}`;
  }

  private async fireRevalidateWebhook(schemeCode: string): Promise<void> {
    const secret = this.config.get<string>("REVALIDATE_HMAC_SECRET");
    const base = this.config.get<string>("REVALIDATE_WEBHOOK_URL");
    if (!secret || !base) {
      this.logger.warn(
        { schemeCode },
        "fund_revalidate_webhook_skipped_missing_config",
      );
      return;
    }
    const tag = `fund:${schemeCode}`;
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
          { schemeCode, status: response.status },
          "fund_revalidate_webhook_non_2xx",
        );
      }
    } catch (err) {
      this.logger.warn(
        { schemeCode, message: this.errorMessage(err) },
        "fund_revalidate_webhook_failed",
      );
    }
  }

  private errorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    return "unknown";
  }
}
