import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import type {
  FundPeer,
  HigherScoringPeer,
} from "@finsight/shared";
import { REDIS_CLIENT } from "../modules/cache/cache.constants";
import type { RedisCacheClient } from "../modules/cache/cache.service";
import {
  FundReportDocEntity,
  type FundReportDocDocument,
} from "./schemas/fund-report-doc.schema";

const PEER_TTL_SECONDS = 24 * 60 * 60;

@Injectable()
export class FundPeerSetService {
  private readonly logger = new Logger(FundPeerSetService.name);

  constructor(
    @InjectModel(FundReportDocEntity.name)
    private readonly model: Model<FundReportDocDocument>,
    @Inject(REDIS_CLIENT) private readonly redis: RedisCacheClient,
  ) {}

  async getPeers(schemeCode: string): Promise<readonly FundPeer[]> {
    const cacheKey = `peers:fund:${schemeCode}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as readonly FundPeer[];
      } catch {
        this.logger.warn(
          { schemeCode },
          "fund_peer_cache_parse_failed_falling_back",
        );
      }
    }

    const subject = await this.model
      .findOne({ schemeCode })
      .select("category meta.aumCr score.value")
      .lean()
      .exec();
    if (!subject) return [];

    type SubjectShape = { category: string; meta?: { aumCr?: number } };
    const subj = subject as unknown as SubjectShape;
    const candidates = await this.model
      .find({
        category: subj.category,
        schemeCode: { $ne: schemeCode },
      })
      .select("schemeCode name score.value meta.aumCr")
      .lean()
      .exec();

    type Candidate = {
      schemeCode: string;
      name: string;
      score: { value: number };
      meta?: { aumCr?: number };
    };
    const subjAum = Math.max(1, subj.meta?.aumCr ?? 1);
    const ranked = (candidates as unknown as Candidate[])
      .map((c) => ({
        c,
        proximity: Math.abs(
          Math.log(Math.max(1, c.meta?.aumCr ?? 1)) - Math.log(subjAum),
        ),
      }))
      .sort((a, b) => a.proximity - b.proximity)
      .slice(0, 3)
      .map(({ c }) => ({
        schemeCode: c.schemeCode,
        name: c.name,
        score: c.score.value,
      }));

    await this.redis.set(
      cacheKey,
      JSON.stringify(ranked),
      "EX",
      PEER_TTL_SECONDS,
    );
    if (ranked.length < 3) {
      this.logger.warn(
        { schemeCode, returned: ranked.length },
        "fund_peer_set_short_pool",
      );
    }
    return ranked;
  }

  async getHigherScoringPeers(
    schemeCode: string,
  ): Promise<readonly HigherScoringPeer[]> {
    const subject = await this.model
      .findOne({ schemeCode })
      .select("category score.value")
      .lean()
      .exec();
    if (!subject) return [];

    type SubjectShape = { category: string; score: { value: number } };
    const subj = subject as unknown as SubjectShape;
    if (subj.score.value >= 6) return [];

    const higher = await this.model
      .find({
        category: subj.category,
        schemeCode: { $ne: schemeCode },
        "score.value": { $gt: subj.score.value },
      })
      .sort({ "score.value": -1 })
      .limit(3)
      .select("schemeCode name score.value")
      .lean()
      .exec();

    type HigherShape = {
      schemeCode: string;
      name: string;
      score: { value: number };
    };
    return (higher as unknown as HigherShape[]).map((h) => ({
      schemeCode: h.schemeCode,
      name: h.name,
      score: h.score.value,
      scoreDelta: Number((h.score.value - subj.score.value).toFixed(2)),
    }));
  }
}
