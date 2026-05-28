import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Types, type Model } from "mongoose";
import type { ScoreResult } from "@finsight/shared";
import {
  Report,
  type ReportDocument,
  type ReportRecord,
  type ReportStatus,
  type SavedReport,
} from "./schemas/report.schema";

export interface CreateReportInput {
  readonly ownerUserId: string;
  readonly status: ReportStatus;
  readonly asset: {
    readonly name: string;
    readonly type: "stock";
    readonly symbol: string;
  };
  readonly quote: {
    readonly symbol: string;
    readonly price: number;
    readonly currency: "INR";
    readonly asOf: string;
    readonly source: string;
  };
  readonly score: ScoreResult;
  readonly citations: readonly string[];
  readonly narrative: string;
  readonly generation: {
    readonly requestHash: string;
    readonly requestedAt: Date;
    readonly completedAt?: Date;
    readonly failedAt?: Date;
    readonly errorCode?: string;
    readonly errorMessage?: string;
  };
}

export interface ListReportsOptions {
  readonly limit?: number;
  readonly cursor?: string;
  readonly symbol?: string;
}

export interface ListReportsResult {
  readonly items: readonly SavedReport[];
  readonly nextCursor: string | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

@Injectable()
export class ReportsRepository {
  constructor(
    @InjectModel(Report.name) private readonly reports: Model<ReportDocument>,
  ) {}

  async create(input: CreateReportInput): Promise<SavedReport> {
    const created = await this.reports.create({
      ...input,
      citations: [...input.citations],
      score: {
        ...input.score,
        insightCards: input.score.insightCards.map((card) => ({ ...card })),
      },
    });
    const saved = await this.reports.findById(created.id).lean<ReportRecord>().exec();
    if (!saved) {
      throw new Error("ReportsRepository.create: persisted report not found");
    }
    return this.toSaved(saved);
  }

  async findByOwnerAndId(
    ownerUserId: string,
    id: string,
  ): Promise<SavedReport | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const report = await this.reports
      .findOne({ _id: new Types.ObjectId(id), ownerUserId })
      .lean<ReportRecord>()
      .exec();
    return report ? this.toSaved(report) : null;
  }

  async listByOwner(
    ownerUserId: string,
    options: ListReportsOptions = {},
  ): Promise<ListReportsResult> {
    const limit = this.normalizeLimit(options.limit);
    const filter: Record<string, unknown> = { ownerUserId };

    if (options.symbol) {
      filter["asset.symbol"] = options.symbol;
    }

    const cursorFilter = this.decodeCursor(options.cursor);
    if (cursorFilter) {
      filter.$or = [
        { createdAt: { $lt: cursorFilter.createdAt } },
        {
          createdAt: cursorFilter.createdAt,
          _id: { $lt: cursorFilter.id },
        },
      ];
    }

    const docs = await this.reports
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean<ReportRecord[]>()
      .exec();

    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? this.encodeCursor(last) : null;

    return {
      items: page.map((doc) => this.toSaved(doc)),
      nextCursor,
    };
  }

  private normalizeLimit(limit: number | undefined): number {
    if (typeof limit !== "number" || !Number.isFinite(limit)) return DEFAULT_LIMIT;
    return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
  }

  private encodeCursor(record: ReportRecord): string {
    const payload = `${record.createdAt.toISOString()}|${record._id.toString()}`;
    return Buffer.from(payload, "utf8").toString("base64url");
  }

  private decodeCursor(
    cursor: string | undefined,
  ): { createdAt: Date; id: Types.ObjectId } | null {
    if (!cursor) return null;
    try {
      const raw = Buffer.from(cursor, "base64url").toString("utf8");
      const [createdAtIso, idHex] = raw.split("|");
      if (!createdAtIso || !idHex || !Types.ObjectId.isValid(idHex)) return null;
      const createdAt = new Date(createdAtIso);
      if (Number.isNaN(createdAt.getTime())) return null;
      return { createdAt, id: new Types.ObjectId(idHex) };
    } catch {
      return null;
    }
  }

  private toSaved(record: ReportRecord): SavedReport {
    return {
      id: record._id.toString(),
      status: record.status,
      asset: {
        name: record.asset.name,
        type: record.asset.type,
        symbol: record.asset.symbol,
      },
      quote: {
        symbol: record.quote.symbol,
        price: record.quote.price,
        currency: record.quote.currency,
        asOf: record.quote.asOf,
        source: record.quote.source,
      },
      score: {
        score: record.score.score,
        verdict: record.score.verdict,
        insightCards: record.score.insightCards.map((card) => ({
          label: card.label,
          score: card.score,
          weight: card.weight,
        })),
      },
      citations: [...record.citations],
      narrative: record.narrative,
      generation: {
        requestHash: record.generation.requestHash,
        requestedAt: record.generation.requestedAt.toISOString(),
        completedAt: record.generation.completedAt?.toISOString(),
        failedAt: record.generation.failedAt?.toISOString(),
        errorCode: record.generation.errorCode,
        errorMessage: record.generation.errorMessage,
      },
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
