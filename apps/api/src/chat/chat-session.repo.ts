import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Content } from "@google/genai";
import type { Model } from "mongoose";
import type { RefusalCategory } from "../ai/refusal/refusal.enum";
import type { ChatScopeType, ToolContext } from "../ai/tools/tool.types";
import {
  ChatSession,
  type ChatCitationDoc,
  type ChatMessage,
  type ChatSessionDocument,
} from "./chat-session.schema";

export interface CreateChatInput {
  readonly userId: string;
  readonly scope: { type: ChatScopeType; symbols: string[] };
  readonly title: string;
}

export interface ListPage {
  readonly items: ChatSessionDocument[];
  readonly nextCursor: string | null;
}

const DEFAULT_LIST_LIMIT = 20;
const DEFAULT_HISTORY_TURNS = 10;

/**
 * Per-user CRUD for chat sessions (CHAT-05). Every read filters by
 * `userId` + `deletedAt: null` — the `getById`/`exists` signatures REQUIRE
 * a `userId` so a tenant-isolation bug is a compile error, not a runtime
 * one. Returns `null` rather than throwing on a miss; the guard converts
 * a miss to a 403.
 */
@Injectable()
export class ChatSessionRepo {
  constructor(
    @InjectModel(ChatSession.name)
    private readonly model: Model<ChatSessionDocument>,
  ) {}

  async create(input: CreateChatInput): Promise<ChatSessionDocument> {
    return this.model.create({
      userId: input.userId,
      title: input.title,
      scope: input.scope,
      messages: [],
      deletedAt: null,
    });
  }

  async listByUser(
    userId: string,
    cursor: string | undefined,
    limit = DEFAULT_LIST_LIMIT,
  ): Promise<ListPage> {
    const filter: Record<string, unknown> = { userId, deletedAt: null };
    if (cursor) filter.updatedAt = { $lt: new Date(cursor) };

    const rows = await this.model
      .find(filter)
      .select("-messages")
      .sort({ updatedAt: -1 })
      .limit(limit + 1)
      .exec();

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    return {
      items,
      nextCursor: hasMore && last ? last.updatedAt.toISOString() : null,
    };
  }

  async getById(sessionId: string, userId: string): Promise<ChatSessionDocument | null> {
    return this.model.findOne({ _id: sessionId, userId, deletedAt: null }).exec();
  }

  /** Ownership probe used by ChatOwnershipGuard. */
  async exists(sessionId: string, userId: string): Promise<boolean> {
    const n = await this.model
      .countDocuments({ _id: sessionId, userId, deletedAt: null })
      .exec();
    return n > 0;
  }

  /** Last N non-refusal, non-tool turns mapped to Gemini `Content[]`. */
  async loadHistory(
    sessionId: string,
    lastN = DEFAULT_HISTORY_TURNS,
  ): Promise<Content[]> {
    const session = await this.model
      .findById(sessionId, { messages: { $slice: -lastN * 2 } })
      .lean<{ messages: ChatMessage[] } | null>()
      .exec();
    if (!session) return [];
    return session.messages
      .filter((m) => !m.refusalCategory && m.role !== "tool")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
  }

  /**
   * Find the persisted REPLY (assistant or refusal) for a client messageId
   * — drives idempotent reconnect. The user echo (role 'user') is ignored.
   */
  async findMessage(sessionId: string, messageId: string): Promise<ChatMessage | null> {
    const session = await this.model
      .findById(sessionId, { messages: 1 })
      .lean<{ messages: ChatMessage[] } | null>()
      .exec();
    if (!session) return null;
    return (
      session.messages.find(
        (m) => m.messageId === messageId && (m.role === "assistant" || m.refusalCategory),
      ) ?? null
    );
  }

  async getScope(
    sessionId: string,
  ): Promise<{ type: ChatScopeType; symbols: string[] } | null> {
    const session = await this.model
      .findById(sessionId, { scope: 1 })
      .lean<{ scope: ToolContext["scope"] } | null>()
      .exec();
    return session ? { type: session.scope.type, symbols: [...session.scope.symbols] } : null;
  }

  async appendUser(sessionId: string, messageId: string, content: string): Promise<void> {
    await this.push(sessionId, { role: "user", content, messageId });
  }

  async appendAssistant(
    sessionId: string,
    messageId: string,
    content: string,
    citations: ChatCitationDoc[],
    refusalCategory?: RefusalCategory,
  ): Promise<void> {
    await this.push(sessionId, {
      role: "assistant",
      content,
      messageId,
      citations,
      refusalCategory,
    });
  }

  async appendRefusal(
    sessionId: string,
    messageId: string,
    category: RefusalCategory,
  ): Promise<void> {
    await this.push(sessionId, {
      role: "assistant",
      content: "",
      messageId,
      refusalCategory: category,
    });
  }

  private async push(
    sessionId: string,
    msg: Partial<ChatMessage> & Pick<ChatMessage, "role" | "content" | "messageId">,
  ): Promise<void> {
    await this.model
      .updateOne(
        { _id: sessionId },
        {
          $push: {
            messages: {
              citations: [],
              toolCalls: [],
              createdAt: new Date(),
              ...msg,
            },
          },
        },
      )
      .exec();
  }
}
