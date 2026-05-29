import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type ClassificationStatus = "pending" | "classified" | "failed";
export type SentimentLabel = "POSITIVE" | "NEGATIVE" | "NEUTRAL";

/**
 * Persisted news record. Mirrors the inflight `NewsItem` from
 * `@finsight/shared` (Phase 2 adapters) plus the per-instrument
 * persistence + Plan 02 enrichment slots:
 *
 *  - `instrumentMentions` — canonical instrumentIds resolved by the
 *    group-ambiguity-aware ticker-tagger. NEVER a brand-only token.
 *  - `groupLevel` — set when the headline mentions ≥2 instruments of
 *    the same parent group (e.g. Adani). Persists for diagnostics +
 *    optional LLM disambiguation in Plan 02.
 *  - `embedding` / `embeddingModel` / `embeddingVersion` — populated by
 *    Plan 02's embed pipeline (gemini-embedding-001 @ 768 dims).
 *  - `sentiment` / `sentimentConfidence` / `sentimentRationale` —
 *    populated by Plan 02's classifier (gemini-2.5-flash-lite) through
 *    the existing ComplianceInterceptor.
 *  - `classificationStatus` — `pending` on insert from this plan.
 *
 * Indexes:
 *  - Unique `(source, externalId)` — primary dedup gate.
 *  - Composite `(instrumentMentions, publishedAt)` — feeds the
 *    `GET /stocks/:ticker/news` materialised read.
 *  - TTL `publishedAt` 90d — hot retention only; archival is open.
 */
@Schema({
  collection: "news",
  timestamps: { createdAt: "fetchedAt", updatedAt: false },
  versionKey: false,
})
export class News {
  @Prop({ type: String, required: true })
  source!: string;

  @Prop({ type: String, required: true })
  externalId!: string;

  @Prop({ type: String, required: true })
  url!: string;

  @Prop({ type: String, required: true })
  canonicalUrl!: string;

  @Prop({ type: String, required: true })
  contentHash!: string;

  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String })
  description?: string;

  @Prop({ type: Date, required: true, index: true })
  publishedAt!: Date;

  @Prop({ type: [String], default: [], index: true })
  instrumentMentions!: string[];

  @Prop({ type: String })
  groupLevel?: string;

  @Prop({ type: [Number] })
  embedding?: number[];

  @Prop({ type: String })
  embeddingModel?: string;

  @Prop({ type: String })
  embeddingVersion?: string;

  @Prop({
    type: String,
    enum: ["POSITIVE", "NEGATIVE", "NEUTRAL"],
  })
  sentiment?: SentimentLabel;

  @Prop({ type: Number, min: 0, max: 1 })
  sentimentConfidence?: number;

  @Prop({ type: String })
  sentimentRationale?: string;

  @Prop({ type: String })
  classifierModel?: string;

  @Prop({ type: String })
  classifierVersion?: string;

  @Prop({
    type: String,
    enum: ["pending", "classified", "failed"],
    default: "pending",
    required: true,
  })
  classificationStatus!: ClassificationStatus;

  fetchedAt?: Date;
}

export type NewsDocument = HydratedDocument<News>;
export const NewsSchema = SchemaFactory.createForClass(News);

NewsSchema.index({ source: 1, externalId: 1 }, { unique: true });
NewsSchema.index({ instrumentMentions: 1, publishedAt: -1 });
NewsSchema.index({ publishedAt: -1 });
// 90d hot retention. Cold-archive policy is open per 06-01-SUMMARY.
NewsSchema.index({ publishedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
