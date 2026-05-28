import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

/**
 * Materialised mutual-fund report document. Mirrors the stock report
 * shape from Plan 04-03 but keyed on AMFI scheme code. Stored as
 * `Mixed` objects where downstream-defined; the public boundary
 * (FundReportDoc shared type) is the authoritative shape.
 */
@Schema({ collection: "fundReports", timestamps: true })
export class FundReportDocEntity {
  @Prop({ type: String, required: true, unique: true, index: true })
  schemeCode!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, required: true })
  category!: string;

  @Prop({ type: String, required: true })
  asOf!: string;

  @Prop({ type: String, default: "" })
  dataVersionHash!: string;

  @Prop({ type: Object, required: true })
  score!: {
    value: number;
    verdict: string;
    pillars: Record<string, number>;
    weightsVersion: string;
  };

  @Prop({ type: Object, required: true })
  returns!: unknown;

  @Prop({ type: Object, required: true })
  risk!: unknown;

  @Prop({ type: [Object], default: [] })
  holdings!: unknown[];

  @Prop({ type: [Object], default: [] })
  sectorAllocation!: unknown[];

  @Prop({ type: Object, required: true })
  meta!: unknown;

  @Prop({ type: [Object], default: [] })
  peers!: unknown[];

  @Prop({ type: Object, default: null })
  narrative!: unknown | null;

  @Prop({ type: [Object], default: [] })
  dataLineage!: unknown[];
}

export type FundReportDocDocument = HydratedDocument<FundReportDocEntity>;

export const FundReportDocSchema = SchemaFactory.createForClass(FundReportDocEntity);

FundReportDocSchema.index({ schemeCode: 1, asOf: -1 });
