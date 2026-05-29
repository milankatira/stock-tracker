import { Injectable, Logger } from "@nestjs/common";
import { Types } from "mongoose";
import { NewsRepository } from "./news.repository";
import type { NewsDocument } from "./news.schema";
import type { ParsedNewsItemDto } from "./dto/news-item.dto";
import { InstrumentsRepository } from "../modules/market-data/instruments/instruments.repository";

export interface NewsListItem {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly source: string;
  readonly publishedAt: string;
  readonly sentiment: NewsDocument["sentiment"] | null;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/**
 * Materialised read path + write-side helpers for the news pipeline.
 * Plan 06-02 adds `markClassified` / `markEmbedded` call sites once the
 * embed/classify processor lands; the methods are ready here so the
 * contract doesn't drift.
 */
@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);

  constructor(
    private readonly repo: NewsRepository,
    private readonly instruments: InstrumentsRepository,
  ) {}

  async getRecentForTicker(
    ticker: string,
    limit = DEFAULT_LIMIT,
  ): Promise<readonly NewsListItem[]> {
    const safeLimit = Math.max(1, Math.min(MAX_LIMIT, limit | 0 || DEFAULT_LIMIT));
    const instrument = await this.instruments.findByNseSymbol(ticker.toUpperCase());
    if (!instrument) return [];
    const docs = await this.repo.findByInstrument(
      String(instrument._id),
      safeLimit,
    );
    return docs.map(this.toListItem);
  }

  async upsertPending(item: ParsedNewsItemDto): Promise<NewsDocument | null> {
    return this.repo.insertPending(item);
  }

  async markClassified(
    id: string,
    payload: {
      readonly sentiment: NewsDocument["sentiment"];
      readonly sentimentConfidence: number;
      readonly sentimentRationale: string | null;
      readonly classifierModel: string;
      readonly classifierVersion: string;
    },
  ): Promise<void> {
    if (!Types.ObjectId.isValid(id)) return;
    await this.repo.updateClassification(id, payload);
  }

  async markEmbedded(
    id: string,
    vector: readonly number[],
    model: string,
    version: string,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(id)) return;
    await this.repo.updateEmbedding(id, vector, model, version);
  }

  private toListItem = (doc: NewsDocument): NewsListItem => ({
    id: String((doc as unknown as { _id: unknown })._id),
    title: doc.title,
    url: doc.url,
    source: doc.source,
    publishedAt: new Date(doc.publishedAt).toISOString(),
    sentiment: doc.sentiment ?? null,
  });
}
