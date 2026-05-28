import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Types, type Model } from "mongoose";
import {
  ScoreHistory,
  type ScoreHistoryDocument,
} from "./score-history.schema";

export interface InsertScoreHistoryInput {
  readonly instrumentId: Types.ObjectId;
  readonly instrumentType: "STOCK" | "FUND";
  readonly asOfDate: string;
  readonly computedAt: Date;
  readonly score: number;
  readonly verdict: "STRONG_SCORE" | "CAUTION" | "WEAK_SCORE";
  readonly pillars: unknown;
  readonly scoringEngineVersion: string;
}

/**
 * INSERT-ONLY repository. MongoDB time-series collections do not
 * support arbitrary updates; idempotency on `(instrumentId, asOfDate)`
 * is delegated to the BullMQ `jobId` policy
 * (`${instrumentId}:${asOfDate}`), which rejects duplicate enqueues
 * before the processor runs.
 */
@Injectable()
export class ScoreHistoryRepository {
  constructor(
    @InjectModel(ScoreHistory.name)
    private readonly model: Model<ScoreHistoryDocument>,
  ) {}

  async insert(input: InsertScoreHistoryInput): Promise<void> {
    await this.model.create(input);
  }

  async findLatest(
    instrumentId: Types.ObjectId,
  ): Promise<ScoreHistoryDocument | null> {
    return this.model
      .findOne({ instrumentId })
      .sort({ computedAt: -1 })
      .lean<ScoreHistoryDocument>()
      .exec();
  }

  async findRange(
    instrumentId: Types.ObjectId,
    fromInclusive: Date,
    toInclusive: Date,
  ): Promise<readonly ScoreHistoryDocument[]> {
    return this.model
      .find({
        instrumentId,
        computedAt: { $gte: fromInclusive, $lte: toInclusive },
      })
      .sort({ computedAt: 1 })
      .lean<ScoreHistoryDocument[]>()
      .exec();
  }
}
