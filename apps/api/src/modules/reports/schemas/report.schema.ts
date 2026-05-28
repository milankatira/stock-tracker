import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import type { InsightCard, ScoreResult } from "@finsight/shared";
import { VERDICTS, type Verdict } from "@finsight/shared";

export const REPORT_STATUSES = ["queued", "running", "completed", "failed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_ASSET_TYPES = ["stock"] as const;
export type ReportAssetType = (typeof REPORT_ASSET_TYPES)[number];

@Schema({ _id: false, versionKey: false })
class ReportAsset {
  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, enum: REPORT_ASSET_TYPES, required: true })
  type!: ReportAssetType;

  @Prop({ type: String, required: true, trim: true })
  symbol!: string;
}

@Schema({ _id: false, versionKey: false })
class ReportQuote {
  @Prop({ type: String, required: true })
  symbol!: string;

  @Prop({ type: Number, required: true })
  price!: number;

  @Prop({ type: String, required: true, enum: ["INR"], default: "INR" })
  currency!: "INR";

  @Prop({ type: String, required: true })
  asOf!: string;

  @Prop({ type: String, required: true })
  source!: string;
}

@Schema({ _id: false, versionKey: false })
class ReportInsightCard {
  @Prop({ type: String, required: true })
  label!: string;

  @Prop({ type: Number, required: true })
  score!: number;

  @Prop({ type: Number, required: true })
  weight!: number;
}

@Schema({ _id: false, versionKey: false })
class ReportScore {
  @Prop({ type: Number, required: true })
  score!: number;

  @Prop({
    type: String,
    enum: [VERDICTS.STRONG_SCORE, VERDICTS.CAUTION, VERDICTS.WEAK_SCORE],
    required: true,
  })
  verdict!: Verdict;

  @Prop({ type: [ReportInsightCard], required: true, default: [] })
  insightCards!: InsightCard[];
}

@Schema({ _id: false, versionKey: false })
class ReportGeneration {
  @Prop({ type: String, required: true })
  requestHash!: string;

  @Prop({ type: Date, required: true })
  requestedAt!: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: Date })
  failedAt?: Date;

  @Prop({ type: String })
  errorCode?: string;

  @Prop({ type: String })
  errorMessage?: string;
}

@Schema({
  collection: "reports",
  timestamps: true,
  versionKey: false,
})
export class Report {
  @Prop({ type: String, required: true, trim: true })
  ownerUserId!: string;

  @Prop({ type: String, enum: REPORT_STATUSES, required: true })
  status!: ReportStatus;

  @Prop({ type: ReportAsset, required: true })
  asset!: ReportAsset;

  @Prop({ type: ReportQuote, required: true })
  quote!: ReportQuote;

  @Prop({ type: ReportScore, required: true })
  score!: ReportScore;

  @Prop({ type: [String], required: true, default: [] })
  citations!: string[];

  @Prop({ type: String, required: true })
  narrative!: string;

  @Prop({ type: ReportGeneration, required: true })
  generation!: ReportGeneration;
}

export type ReportDocument = HydratedDocument<Report>;
export type ReportRecord = Report & {
  readonly _id: Types.ObjectId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export const ReportSchema = SchemaFactory.createForClass(Report);

ReportSchema.index({ ownerUserId: 1, createdAt: -1, _id: -1 });
ReportSchema.index({ ownerUserId: 1, "asset.symbol": 1, createdAt: -1 });
ReportSchema.index({ ownerUserId: 1, "generation.requestHash": 1, createdAt: -1 });

export interface SavedReport {
  readonly id: string;
  readonly status: ReportStatus;
  readonly asset: { readonly name: string; readonly type: ReportAssetType; readonly symbol: string };
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
    readonly requestedAt: string;
    readonly completedAt?: string;
    readonly failedAt?: string;
    readonly errorCode?: string;
    readonly errorMessage?: string;
  };
  readonly createdAt: string;
  readonly updatedAt: string;
}
