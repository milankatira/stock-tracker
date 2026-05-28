import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

/**
 * Single denormalised report doc per stock. One per ticker (unique
 * index). The shape mirrors the `StockReportDoc` exported by
 * `@finsight/shared` — fields are stored as `Mixed` objects to keep
 * the schema flexible while the upstream contracts evolve. Strict
 * shape validation happens at the API boundary via the DTO classes.
 */
@Schema({ _id: false, versionKey: false })
class ScorePayload {
  @Prop({ type: Number, required: true })
  value!: number;

  @Prop({
    type: String,
    enum: ["STRONG_SCORE", "CAUTION", "WEAK_SCORE"],
    required: true,
  })
  verdict!: "STRONG_SCORE" | "CAUTION" | "WEAK_SCORE";

  @Prop({ type: Object, required: true })
  pillars!: Record<string, number>;

  @Prop({ type: String, required: true })
  weightsVersion!: string;
}

@Schema({
  collection: "stockReports",
  timestamps: true,
  versionKey: false,
})
export class StockReportDocEntity {
  @Prop({ type: String, required: true, unique: true })
  ticker!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, required: true })
  sector!: string;

  @Prop({ type: String, required: true })
  asOf!: string;

  @Prop({ type: String, required: true, default: "" })
  dataVersionHash!: string;

  @Prop({ type: ScorePayload, required: true })
  score!: ScorePayload;

  @Prop({ type: Object, required: true })
  fundamentals!: Record<string, number>;

  @Prop({ type: Object, required: true })
  technicals!: Record<string, unknown>;

  @Prop({ type: Object, required: true })
  insights!: Record<string, unknown>;

  @Prop({ type: [Object], required: true, default: [] })
  peers!: Record<string, unknown>[];

  @Prop({ type: Object, default: null })
  narrative!: Record<string, unknown> | null;

  @Prop({ type: [Object], required: true, default: [] })
  dataLineage!: Record<string, unknown>[];

  @Prop({ type: Boolean, default: false })
  fallbackUsed?: boolean;
}

export type StockReportDocDocument = HydratedDocument<StockReportDocEntity>;
export const StockReportDocSchema =
  SchemaFactory.createForClass(StockReportDocEntity);

StockReportDocSchema.index({ ticker: 1 }, { unique: true });
StockReportDocSchema.index({ ticker: 1, asOf: -1 });
