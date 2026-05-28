import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import type { OHLCVBar } from "@finsight/shared";
import {
  PriceHistory,
  type PriceHistoryDocument,
  type PriceHistoryRecord,
} from "./price-history.schema";

export interface PersistedBarInput extends OHLCVBar {
  readonly instrumentId: string;
  readonly source: string;
}

@Injectable()
export class PriceHistoryRepository {
  constructor(
    @InjectModel(PriceHistory.name)
    private readonly model: Model<PriceHistoryDocument>,
  ) {}

  async insertMany(bars: readonly PersistedBarInput[]): Promise<number> {
    if (bars.length === 0) return 0;
    const docs = bars.map((bar) => ({
      ts: bar.ts,
      meta: { instrumentId: bar.instrumentId, source: bar.source },
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      rawClose: bar.rawClose,
      volume: bar.volume,
      isAdjusted: true,
    }));
    await this.model.insertMany(docs, { ordered: false });
    return docs.length;
  }

  async findByInstrument(
    instrumentId: string,
  ): Promise<readonly PriceHistoryRecord[]> {
    return this.model
      .find({ "meta.instrumentId": instrumentId })
      .sort({ ts: 1 })
      .lean<PriceHistoryRecord[]>()
      .exec();
  }
}
