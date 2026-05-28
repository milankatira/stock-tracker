import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

/**
 * MongoDB time-series collection for mutual fund NAV history.
 * `meta.schemeCode` is the AMFI scheme code (string — leading zeros
 * preserved). Stored once per day per scheme.
 */
@Schema({ _id: false, versionKey: false })
export class NavHistoryMeta {
  @Prop({ type: String, required: true })
  schemeCode!: string;

  @Prop({ type: String, required: true })
  source!: string;
}

@Schema({
  collection: "nav_history",
  versionKey: false,
  timestamps: { createdAt: true, updatedAt: false },
  timeseries: {
    timeField: "ts",
    metaField: "meta",
    granularity: "hours",
  },
})
export class NavHistory {
  @Prop({ type: Date, required: true })
  ts!: Date;

  @Prop({ type: NavHistoryMeta, required: true })
  meta!: NavHistoryMeta;

  @Prop({ type: Number, required: true })
  nav!: number;
}

export type NavHistoryDocument = HydratedDocument<NavHistory>;
export type NavHistoryRecord = NavHistory & {
  readonly _id?: Types.ObjectId;
};

export const NavHistorySchema = SchemaFactory.createForClass(NavHistory);
