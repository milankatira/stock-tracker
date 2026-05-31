import { apiFetch } from "@/lib/api-client";

export type ChatScopeType = "stock" | "fund" | "portfolio" | "compare";
export type SentimentLabel = "POSITIVE" | "NEGATIVE" | "NEUTRAL";

export interface ChatCitation {
  readonly sourceTag: string;
  readonly asOfDate: string;
}

export interface ChatMessage {
  readonly role: "user" | "assistant" | "tool";
  readonly content: string;
  readonly citations: ChatCitation[];
  readonly messageId: string;
  readonly refusalCategory?: string;
  readonly createdAt: string;
}

export interface ChatScope {
  readonly type: ChatScopeType;
  readonly symbols: string[];
}

export interface ChatSessionSummary {
  readonly _id: string;
  readonly title: string;
  readonly scope: ChatScope;
  readonly updatedAt: string;
}

export interface ChatSessionDetail extends ChatSessionSummary {
  readonly messages: ChatMessage[];
}

export interface ChatListPage {
  readonly items: ChatSessionSummary[];
  readonly nextCursor: string | null;
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3001";

/** Public base used by the client SSE stream (cookie auth via credentials). */
export const CHAT_API_BASE = API_BASE;

/**
 * Server-side fetch (RSC) that forwards the incoming `access_token` cookie —
 * RSC fetches do not propagate browser cookies automatically. Used by the
 * `/chat` list + `/chat/[id]` pages.
 */
async function serverFetch<T>(path: string): Promise<T | null> {
  const { cookies } = await import("next/headers");
  const token = (await cookies()).get("access_token")?.value;
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { accept: "application/json", cookie: `access_token=${token}` } : { accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw new Error(`chat fetch failed: ${res.status}`);
  return (await res.json()) as T;
}

export async function listChats(cursor?: string): Promise<ChatListPage> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return (await serverFetch<ChatListPage>(`/chats${qs}`)) ?? { items: [], nextCursor: null };
}

export async function getChat(id: string): Promise<ChatSessionDetail | null> {
  return serverFetch<ChatSessionDetail>(`/chats/${encodeURIComponent(id)}`);
}

/** Client-side create (POST → CSRF handled by apiFetch). */
export async function createChat(input: {
  title: string;
  scope: ChatScope;
}): Promise<ChatSessionSummary> {
  return apiFetch<ChatSessionSummary>("/chats", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
