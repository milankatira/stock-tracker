import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import type { NavPoint } from "@finsight/shared";
import {
  NavHistory,
  type NavHistoryDocument,
  type NavHistoryRecord,
} from "./nav-history.schema";

export interface PersistedNavInput extends NavPoint {
  readonly schemeCode: string;
  readonly source: string;
}

@Injectable()
export class NavHistoryRepository {
  constructor(
    @InjectModel(NavHistory.name)
    private readonly model: Model<NavHistoryDocument>,
  ) {}

  async insertMany(points: readonly PersistedNavInput[]): Promise<number> {
    if (points.length === 0) return 0;
    const docs = points.map((point) => ({
      ts: point.ts,
      meta: { schemeCode: point.schemeCode, source: point.source },
      nav: point.nav,
    }));
    await this.model.insertMany(docs, { ordered: false });
    return docs.length;
  }

  async findByScheme(
    schemeCode: string,
  ): Promise<readonly NavHistoryRecord[]> {
    return this.model
      .find({ "meta.schemeCode": schemeCode })
      .sort({ ts: 1 })
      .lean<NavHistoryRecord[]>()
      .exec();
  }
}
