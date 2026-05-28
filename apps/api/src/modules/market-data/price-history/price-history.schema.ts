import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

/**
 * MongoDB time-series collection for OHLCV history.
 *
 * Always-adjusted invariant: every persisted bar has `close = adjClose`
 * (split + bonus + dividend adjusted). `rawClose` carries the unadjusted
 * upstream close so the adjustment service can audit and back-adjust on
 * newly-observed corporate actions.
 *
 * `meta.instrumentId` is the canonical Instrument `_id` string; time
 * series collections auto-index the metaField, so per-instrument
 * range queries are fast.
 */
@Schema({ _id: false, versionKey: false })
export class PriceHistoryMeta {
  @Prop({ type: String, required: true })
  instrumentId!: string;

  @Prop({ type: String, required: true })
  source!: string;
}

@Schema({
  collection: "price_history",
  versionKey: false,
  timestamps: { createdAt: true, updatedAt: false },
  timeseries: {
    timeField: "ts",
    metaField: "meta",
    granularity: "hours",
  },
})
export class PriceHistory {
  @Prop({ type: Date, required: true })
  ts!: Date;

  @Prop({ type: PriceHistoryMeta, required: true })
  meta!: PriceHistoryMeta;

  @Prop({ type: Number, required: true })
  open!: number;

  @Prop({ type: Number, required: true })
  high!: number;

  @Prop({ type: Number, required: true })
  low!: number;

  /** Adjusted close — Phase 3 scoring trusts this is already corp-action adjusted. */
  @Prop({ type: Number, required: true })
  close!: number;

  /** Raw upstream close (unadjusted) — preserved for audit. */
  @Prop({ type: Number, required: true })
  rawClose!: number;

  @Prop({ type: Number, required: true })
  volume!: number;

  @Prop({ type: Boolean, required: true, default: true })
  isAdjusted!: boolean;
}

export type PriceHistoryDocument = HydratedDocument<PriceHistory>;
export type PriceHistoryRecord = PriceHistory & {
  readonly _id?: Types.ObjectId;
};

export const PriceHistorySchema = SchemaFactory.createForClass(PriceHistory);
