import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export type InstrumentType = "STOCK" | "FUND";
export const INSTRUMENT_TYPES: readonly InstrumentType[] = ["STOCK", "FUND"];

/**
 * MongoDB time-series collection for daily score outputs. The actual
 * `createCollection` happens at boot via `ScoreHistoryBootstrap`
 * because Mongoose's auto-create does not always honour the
 * `timeseries` config on first insert.
 *
 * Cross-phase contract — readers in Phase 4 / 5 / 8 depend on this
 * shape; mutate only with a `scoringEngineVersion` bump.
 */
@Schema({
  collection: "score_history",
  versionKey: false,
  timestamps: false,
  timeseries: {
    timeField: "computedAt",
    metaField: "instrumentId",
    granularity: "hours",
  },
  expireAfterSeconds: 60 * 60 * 24 * 365 * 3,
})
export class ScoreHistory {
  @Prop({ type: Types.ObjectId, required: true })
  instrumentId!: Types.ObjectId;

  @Prop({ type: String, enum: INSTRUMENT_TYPES, required: true })
  instrumentType!: InstrumentType;

  /** `'YYYY-MM-DD'` in IST — domain key. */
  @Prop({ type: String, required: true })
  asOfDate!: string;

  /** UTC timestamp — time-series collection's `timeField`. */
  @Prop({ type: Date, required: true })
  computedAt!: Date;

  @Prop({ type: Number, required: true })
  score!: number;

  @Prop({
    type: String,
    enum: ["STRONG_SCORE", "CAUTION", "WEAK_SCORE"],
    required: true,
  })
  verdict!: "STRONG_SCORE" | "CAUTION" | "WEAK_SCORE";

  /** Full pillar / sub-factor breakdown (serialised, opaque to readers). */
  @Prop({ type: Object, required: true })
  pillars!: unknown;

  @Prop({ type: String, required: true })
  scoringEngineVersion!: string;
}

export type ScoreHistoryDocument = HydratedDocument<ScoreHistory>;
export const ScoreHistorySchema = SchemaFactory.createForClass(ScoreHistory);
