import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

/**
 * Canonical fund master document. `schemeCode` is the AMFI scheme code as
 * a string (leading zeros are significant — see RESEARCH.md Pattern 4).
 *
 * Cross-phase contract: `popularity` (AUM, ₹ crore) drives Phase 5 search
 * ranking. The `(amcCode, name, plan, option)` compound unique index
 * keeps DIRECT vs REGULAR / GROWTH vs IDCW variants as distinct documents.
 */
@Schema({
  collection: "funds",
  timestamps: true,
  versionKey: false,
  collation: { locale: "en", strength: 2 },
})
export class Fund {
  @Prop({ type: String, required: true, unique: true })
  schemeCode!: string;

  @Prop({ type: String, sparse: true, unique: true })
  isin?: string;

  @Prop({ type: String, required: true })
  amcCode!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, required: true, enum: ["DIRECT", "REGULAR"] })
  plan!: "DIRECT" | "REGULAR";

  @Prop({ type: String, required: true, enum: ["GROWTH", "IDCW"] })
  option!: "GROWTH" | "IDCW";

  @Prop({ type: String, required: true, default: "Unknown" })
  category!: string;

  @Prop({ type: String })
  benchmark?: string;

  /** AUM in ₹ crore — Phase 5 search ranking. */
  @Prop({ type: Number, required: true, default: 0, index: true })
  popularity!: number;

  @Prop({ type: Boolean, default: true })
  isActive!: boolean;

  @Prop({ type: String, default: "" })
  dataVersionHash!: string;

  @Prop({ type: Date })
  lastNavTs?: Date;
}

export type FundDocument = HydratedDocument<Fund>;
export type FundRecord = Fund & {
  readonly _id: Types.ObjectId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export const FundSchema = SchemaFactory.createForClass(Fund);

FundSchema.index({ schemeCode: 1 }, { unique: true });
FundSchema.index(
  { amcCode: 1, name: 1, plan: 1, option: 1 },
  { unique: true },
);
FundSchema.index({ popularity: -1 });
// Phase 5 search will introduce a name index — see instrument.schema.ts.
