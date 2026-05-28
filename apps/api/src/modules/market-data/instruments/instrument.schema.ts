import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

/**
 * Canonical instrument master document.
 *
 * Cross-phase contracts (do NOT remove or migrate away):
 *  - `popularity` (market cap, ₹ crore) — Phase 5 search ranking sorts by this.
 *  - `dataVersionHash` (sha1 over [lastPriceTs, lastFundamentalsTs, lastNewsTs])
 *    — Phase 4 narrative cache key seed.
 *
 * Collation `{ locale: 'en', strength: 2 }` makes the `nseSymbol` lookups
 * case-insensitive at the index level so `'reliance'`, `'RELIANCE'`, and
 * `'Reliance'` resolve to the same document without an explicit collation
 * hint at every call site.
 */
@Schema({
  collection: "instruments",
  timestamps: true,
  versionKey: false,
  collation: { locale: "en", strength: 2 },
})
export class Instrument {
  @Prop({ type: String, sparse: true, unique: true })
  isin?: string;

  @Prop({ type: String, required: true, unique: true })
  nseSymbol!: string;

  @Prop({ type: String, sparse: true, unique: true })
  bseCode?: string;

  @Prop({ type: String, required: true, unique: true })
  yahooSymbol!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, required: true, enum: ["NSE", "BSE"] })
  primaryExchange!: "NSE" | "BSE";

  @Prop({ type: String, required: true, default: "INR" })
  currency!: string;

  @Prop({ type: String })
  sector?: string;

  @Prop({ type: String })
  industry?: string;

  @Prop({ type: String, enum: ["LARGE", "MID", "SMALL"] })
  marketCapCategory?: "LARGE" | "MID" | "SMALL";

  /** Market cap in ₹ crore — Phase 5 search ranking. */
  @Prop({ type: Number, required: true, default: 0, index: true })
  popularity!: number;

  @Prop({ type: Boolean, default: true })
  isActive!: boolean;

  /** sha1 over [lastPriceTs, lastFundamentalsTs, lastNewsTs] — Phase 4 cache key. */
  @Prop({ type: String, default: "" })
  dataVersionHash!: string;

  @Prop({ type: Date })
  lastPriceTs?: Date;

  @Prop({ type: Date })
  lastFundamentalsTs?: Date;

  @Prop({ type: Date })
  lastNewsTs?: Date;
}

export type InstrumentDocument = HydratedDocument<Instrument>;
export type InstrumentRecord = Instrument & {
  readonly _id: Types.ObjectId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export const InstrumentSchema = SchemaFactory.createForClass(Instrument);

InstrumentSchema.index(
  { nseSymbol: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } },
);
InstrumentSchema.index({ yahooSymbol: 1 }, { unique: true });
InstrumentSchema.index({ bseCode: 1 }, { unique: true, sparse: true });
InstrumentSchema.index({ isin: 1 }, { unique: true, sparse: true });
InstrumentSchema.index({ popularity: -1 });
// Phase 5 search will introduce a name index (Atlas Search or a plain
// equality index with the right collation). MongoDB `text` indexes do
// not coexist with the schema-level case-insensitive collation; defer.
