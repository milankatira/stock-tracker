import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { News, type NewsDocument } from "./news.schema";
import type { ParsedNewsItemDto } from "./dto/news-item.dto";
import {
  NEWS_VECTOR_INDEX_NAME,
} from "./vector/vector-index.constants";

export interface VectorSearchOpts {
  readonly queryVector: number[];
  readonly instrumentId: string;
  readonly sinceDays?: number;
  readonly numCandidates?: number;
  readonly limit?: number;
}

const VECTOR_MAX_CANDIDATES = 500;
const VECTOR_MAX_LIMIT = 50;
const DAY_MS = 86_400_000;

interface DuplicateKeyError {
  readonly code?: number;
  readonly name?: string;
}

@Injectable()
export class NewsRepository {
  private readonly logger = new Logger(NewsRepository.name);

  constructor(
    @InjectModel(News.name) private readonly model: Model<NewsDocument>,
  ) {}

  /**
   * Insert a parsed news item with `classificationStatus: 'pending'`.
   * Returns the persisted doc, or `null` when the unique `(source,
   * externalId)` index rejects the write as a duplicate.
   */
  async insertPending(item: ParsedNewsItemDto): Promise<NewsDocument | null> {
    try {
      const doc = await this.model.create({
        ...item,
        classificationStatus: "pending",
      });
      return doc;
    } catch (err) {
      if (this.isDuplicateKey(err)) {
        return null;
      }
      throw err;
    }
  }

  async findByInstrument(
    instrumentId: string,
    limit: number,
  ): Promise<readonly NewsDocument[]> {
    return this.model
      .find({ instrumentMentions: instrumentId })
      .sort({ publishedAt: -1 })
      .limit(limit)
      .lean<NewsDocument[]>()
      .exec();
  }

  async findById(id: string): Promise<NewsDocument | null> {
    return this.model.findById(id).lean<NewsDocument>().exec();
  }

  async markFailed(id: string): Promise<void> {
    await this.model
      .updateOne({ _id: id }, { $set: { classificationStatus: "failed" } })
      .exec();
  }

  async findPending(limit: number): Promise<readonly NewsDocument[]> {
    return this.model
      .find({ classificationStatus: "pending" })
      .sort({ publishedAt: -1 })
      .limit(limit)
      .lean<NewsDocument[]>()
      .exec();
  }

  async updateClassification(
    id: string,
    payload: {
      readonly sentiment: NewsDocument["sentiment"];
      readonly sentimentConfidence: number;
      readonly sentimentRationale: string | null;
      readonly classifierModel: string;
      readonly classifierVersion: string;
    },
  ): Promise<void> {
    await this.model
      .updateOne(
        { _id: id },
        {
          $set: {
            sentiment: payload.sentiment ?? undefined,
            sentimentConfidence: payload.sentimentConfidence,
            sentimentRationale: payload.sentimentRationale ?? undefined,
            classifierModel: payload.classifierModel,
            classifierVersion: payload.classifierVersion,
            classificationStatus: "classified",
          },
        },
      )
      .exec();
  }

  async updateEmbedding(
    id: string,
    vector: readonly number[],
    model: string,
    version: string,
  ): Promise<void> {
    await this.model
      .updateOne(
        { _id: id },
        {
          $set: {
            embedding: Array.from(vector),
            embeddingModel: model,
            embeddingVersion: version,
          },
        },
      )
      .exec();
  }

  /**
   * Classified news for an instrument within the last `sinceDays`,
   * newest first — the input set for the sentiment-pillar aggregator
   * (NEWS-04). No vector ops; straight indexed query on
   * `instrumentMentions` + `publishedAt` + `classificationStatus`.
   */
  async findRecentClassifiedForInstrument(
    instrumentId: string,
    sinceDays: number,
  ): Promise<readonly NewsDocument[]> {
    const since = new Date(Date.now() - sinceDays * DAY_MS);
    return this.model
      .find({
        instrumentMentions: instrumentId,
        classificationStatus: "classified",
        publishedAt: { $gte: since },
      })
      .sort({ publishedAt: -1 })
      .lean<NewsDocument[]>()
      .exec();
  }

  /**
   * Atlas `$vectorSearch` kNN over the news embeddings, pre-filtered by
   * instrument + recency (NEWS-03). DoS-capped on `numCandidates` and
   * `limit`. Atlas-only — does not run on mongodb-memory-server, so its
   * integration test is gated behind `RUN_INTEGRATION=1`.
   */
  async semanticSearch(
    opts: VectorSearchOpts,
  ): Promise<ReadonlyArray<Record<string, unknown>>> {
    const since = new Date(Date.now() - (opts.sinceDays ?? 30) * DAY_MS);
    return this.model
      .aggregate([
        {
          $vectorSearch: {
            index: NEWS_VECTOR_INDEX_NAME,
            path: "embedding",
            queryVector: opts.queryVector,
            numCandidates: Math.min(
              opts.numCandidates ?? 200,
              VECTOR_MAX_CANDIDATES,
            ),
            limit: Math.min(opts.limit ?? 10, VECTOR_MAX_LIMIT),
            filter: {
              instrumentMentions: opts.instrumentId,
              publishedAt: { $gte: since },
            },
          },
        },
        {
          $project: {
            _id: 1,
            title: 1,
            url: 1,
            source: 1,
            publishedAt: 1,
            sentiment: 1,
            sentimentConfidence: 1,
            score: { $meta: "vectorSearchScore" },
          },
        },
      ])
      .exec();
  }

  private isDuplicateKey(err: unknown): boolean {
    const e = err as DuplicateKeyError;
    return e?.code === 11000 || e?.name === "MongoServerError" && e.code === 11000;
  }
}
