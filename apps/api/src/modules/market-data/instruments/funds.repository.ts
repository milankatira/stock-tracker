import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { AnyBulkWriteOperation, Model } from "mongoose";
import { Fund, type FundDocument, type FundRecord } from "./fund.schema";

export interface FundSeedInput {
  readonly schemeCode: string;
  readonly amcCode: string;
  readonly name: string;
  readonly plan: "DIRECT" | "REGULAR";
  readonly option: "GROWTH" | "IDCW";
  readonly category?: string;
  readonly benchmark?: string;
  readonly isin?: string;
}

@Injectable()
export class FundsRepository {
  constructor(
    @InjectModel(Fund.name)
    private readonly funds: Model<FundDocument>,
  ) {}

  findBySchemeCode(schemeCode: string): Promise<FundRecord | null> {
    return this.funds
      .findOne({ schemeCode })
      .lean<FundRecord>()
      .exec();
  }

  findById(id: string): Promise<FundRecord | null> {
    return this.funds.findById(id).lean<FundRecord>().exec();
  }

  async bulkUpsert(seeds: readonly FundSeedInput[]): Promise<number> {
    if (seeds.length === 0) return 0;
    const ops: AnyBulkWriteOperation<FundDocument>[] = seeds.map((seed) => ({
      updateOne: {
        filter: { schemeCode: seed.schemeCode },
        update: {
          $set: {
            amcCode: seed.amcCode,
            name: seed.name,
            plan: seed.plan,
            option: seed.option,
            category: seed.category ?? "Unknown",
            benchmark: seed.benchmark,
            isin: seed.isin,
          },
          $setOnInsert: {
            schemeCode: seed.schemeCode,
            popularity: 0,
            dataVersionHash: "",
            isActive: true,
          },
        },
        upsert: true,
      },
    }));
    const result = await this.funds.bulkWrite(ops);
    return (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0);
  }
}
