import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { News, type NewsDocument } from "./news.schema";
import type { ParsedNewsItemDto } from "./dto/news-item.dto";

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

  /** Plan 02 wires the actual vector search; this method stays a stub. */
  semanticSearch(): never {
    throw new Error("NewsRepository.semanticSearch is owned by Plan 06-02");
  }

  private isDuplicateKey(err: unknown): boolean {
    const e = err as DuplicateKeyError;
    return e?.code === 11000 || e?.name === "MongoServerError" && e.code === 11000;
  }
}
