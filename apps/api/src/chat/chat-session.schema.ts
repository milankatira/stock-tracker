import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import type { RefusalCategory } from "../ai/refusal/refusal.enum";
import type { ChatScopeType } from "../ai/tools/tool.types";

export interface ChatCitationDoc {
  readonly sourceTag: string;
  readonly asOfDate: Date;
}

export interface ChatToolCallDoc {
  readonly name: string;
  readonly sourceTag: string;
}

/**
 * Embedded chat message. `_id: false` — messages are addressed by their
 * client-supplied `messageId` (used for idempotent reconnect), not a
 * server ObjectId.
 */
@Schema({ _id: false })
export class ChatMessage {
  @Prop({ type: String, required: true, enum: ["user", "assistant", "tool"] })
  role!: "user" | "assistant" | "tool";

  @Prop({ type: String, required: true })
  content!: string;

  @Prop({ type: [{ sourceTag: String, asOfDate: Date }], default: [] })
  citations!: ChatCitationDoc[];

  @Prop({ type: [{ name: String, sourceTag: String }], default: [] })
  toolCalls!: ChatToolCallDoc[];

  @Prop({ type: String, required: false })
  refusalCategory?: RefusalCategory;

  @Prop({ type: String, required: true })
  messageId!: string;

  @Prop({ type: Date, required: true, default: () => new Date() })
  createdAt!: Date;
}

const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);

/** Conversation scope sub-document — which instrument(s) the chat is about. */
@Schema({ _id: false })
export class ChatScope {
  @Prop({ type: String, required: true, enum: ["stock", "fund", "portfolio", "compare"] })
  type!: ChatScopeType;

  @Prop({ type: [String], default: [] })
  symbols!: string[];
}

const ChatScopeSchema = SchemaFactory.createForClass(ChatScope);

/**
 * Per-user chat session (CHAT-05). `userId` is the JWT-verified string id
 * (mirrors the watchlist convention). Messages are embedded; soft-delete
 * via `deletedAt`. Every read path filters by `userId` + `deletedAt: null`.
 */
@Schema({ collection: "chat_sessions", timestamps: true })
export class ChatSession {
  @Prop({ type: String, required: true, index: true })
  userId!: string;

  @Prop({ type: String, required: true, maxlength: 120 })
  title!: string;

  @Prop({ type: ChatScopeSchema, required: true })
  scope!: ChatScope;

  @Prop({ type: [ChatMessageSchema], default: [] })
  messages!: ChatMessage[];

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type ChatSessionDocument = HydratedDocument<ChatSession>;
export const ChatSessionSchema = SchemaFactory.createForClass(ChatSession);

// List view — newest first, scoped by user.
ChatSessionSchema.index({ userId: 1, updatedAt: -1 });
// Soft-delete filter.
ChatSessionSchema.index({ userId: 1, deletedAt: 1 });
// Idempotent-reconnect lookup by embedded messageId.
ChatSessionSchema.index({ "messages.messageId": 1 });

// scope.symbols must hold 1–3 instruments.
ChatSessionSchema.path("scope").validate(function (
  value: { symbols?: string[] } | undefined,
): boolean {
  const len = value?.symbols?.length ?? 0;
  return len >= 1 && len <= 3;
}, "scope.symbols must contain 1 to 3 entries");
