import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { AnyBulkWriteOperation, Model } from "mongoose";
import {
  Instrument,
  type InstrumentDocument,
  type InstrumentRecord,
} from "./instrument.schema";

export interface InstrumentSeedInput {
  readonly nseSymbol: string;
  readonly yahooSymbol: string;
  readonly name: string;
  readonly primaryExchange: "NSE" | "BSE";
  readonly bseCode?: string;
  readonly isin?: string;
  readonly sector?: string;
  readonly industry?: string;
  readonly marketCapCategory?: "LARGE" | "MID" | "SMALL";
}

@Injectable()
export class InstrumentsRepository {
  constructor(
    @InjectModel(Instrument.name)
    private readonly instruments: Model<InstrumentDocument>,
  ) {}

  findById(id: string): Promise<InstrumentRecord | null> {
    return this.instruments.findById(id).lean<InstrumentRecord>().exec();
  }

  findByNseSymbol(symbol: string): Promise<InstrumentRecord | null> {
    return this.instruments
      .findOne({ nseSymbol: symbol })
      .collation({ locale: "en", strength: 2 })
      .lean<InstrumentRecord>()
      .exec();
  }

  findByYahooSymbol(symbol: string): Promise<InstrumentRecord | null> {
    return this.instruments
      .findOne({ yahooSymbol: symbol })
      .lean<InstrumentRecord>()
      .exec();
  }

  findByBseCode(code: string): Promise<InstrumentRecord | null> {
    return this.instruments
      .findOne({ bseCode: code })
      .lean<InstrumentRecord>()
      .exec();
  }

  findByIsin(isin: string): Promise<InstrumentRecord | null> {
    return this.instruments
      .findOne({ isin })
      .lean<InstrumentRecord>()
      .exec();
  }

  async listActiveTickers(): Promise<readonly InstrumentRecord[]> {
    return this.instruments
      .find({ isActive: true })
      .sort({ popularity: -1 })
      .lean<InstrumentRecord[]>()
      .exec();
  }

  async bulkUpsert(seeds: readonly InstrumentSeedInput[]): Promise<number> {
    if (seeds.length === 0) return 0;
    const ops: AnyBulkWriteOperation<InstrumentDocument>[] = seeds.map(
      (seed) => ({
        updateOne: {
          filter: { nseSymbol: seed.nseSymbol },
          update: {
            $set: {
              yahooSymbol: seed.yahooSymbol,
              name: seed.name,
              primaryExchange: seed.primaryExchange,
              bseCode: seed.bseCode,
              isin: seed.isin,
              sector: seed.sector,
              industry: seed.industry,
              marketCapCategory: seed.marketCapCategory,
            },
            $setOnInsert: {
              nseSymbol: seed.nseSymbol,
              popularity: 0,
              dataVersionHash: "",
              isActive: true,
              currency: "INR",
            },
          },
          upsert: true,
        },
      }),
    );
    const result = await this.instruments.bulkWrite(ops, {
      collation: { locale: "en", strength: 2 },
    });
    return (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0);
  }

  async updateFields(
    id: string,
    patch: Partial<Pick<
      Instrument,
      | "lastPriceTs"
      | "lastFundamentalsTs"
      | "lastNewsTs"
      | "dataVersionHash"
    >>,
  ): Promise<void> {
    await this.instruments
      .updateOne({ _id: id }, { $set: patch })
      .exec();
  }
}
