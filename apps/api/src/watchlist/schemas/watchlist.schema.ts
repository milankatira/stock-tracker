import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

@Schema({ _id: false })
export class WatchlistEntry {
  @Prop({ type: Types.ObjectId, required: true })
  instrumentId!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ["STOCK", "FUND"] })
  instrumentType!: "STOCK" | "FUND";

  @Prop({ type: Date, required: true, default: () => new Date() })
  addedAt!: Date;
}

const WatchlistEntrySchema = SchemaFactory.createForClass(WatchlistEntry);

/**
 * Per-user single watchlist document. Keyed on `userId` (string id from
 * the JWT-verified `AuthenticatedUser`). `optimisticConcurrency: true`
 * surfaces concurrent edits as `VersionError`; the service retries
 * once and rethrows on a second failure.
 */
@Schema({
  collection: "watchlists",
  timestamps: true,
  versionKey: "__v",
  optimisticConcurrency: true,
})
export class Watchlist {
  @Prop({ type: String, required: true, unique: true, index: true })
  userId!: string;

  @Prop({ type: [WatchlistEntrySchema], default: [] })
  instruments!: WatchlistEntry[];
}

export type WatchlistDocument = HydratedDocument<Watchlist>;
export const WatchlistSchema = SchemaFactory.createForClass(Watchlist);
