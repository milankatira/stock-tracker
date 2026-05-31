"use client";

import * as React from "react";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { nanoid } from "nanoid";
import type { ChatCitation, ChatMessage } from "@/lib/chat-api";
import { CHAT_API_BASE } from "@/lib/chat-api";
import { MessageBubble } from "./message-bubble";
import { RefusalBanner } from "./refusal-banner";
import { ToolBreadcrumb } from "./tool-breadcrumb";
import { ChatInput } from "./chat-input";

interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: ChatCitation[];
  missing?: string[];
  streaming?: boolean;
  refusal?: { category: string; message: string };
  tools: { name: string; done: boolean }[];
}

function toUi(m: ChatMessage): UiMessage {
  return {
    id: m.messageId + m.role,
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
    citations: m.citations,
    refusal: m.refusalCategory
      ? { category: m.refusalCategory, message: m.content || "Request declined." }
      : undefined,
    tools: [],
  };
}

interface ChatThreadProps {
  readonly sessionId: string;
  readonly initialMessages: ChatMessage[];
}

/**
 * Live chat thread (CHAT-01/03/04). Streams the assistant reply via
 * `@microsoft/fetch-event-source` with HttpOnly-cookie credentials and
 * renders token shimmer, tool breadcrumbs, citation pills, [verify]
 * markers, and refusal banners. Aborts the in-flight stream on unmount.
 */
export function ChatThread({ sessionId, initialMessages }: ChatThreadProps) {
  const [messages, setMessages] = React.useState<UiMessage[]>(() =>
    initialMessages.filter((m) => m.role !== "tool").map(toUi),
  );
  const [streaming, setStreaming] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  const patchAssistant = (id: string, patch: Partial<UiMessage>): void => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    );
  };

  const send = (content: string): void => {
    const messageId = nanoid();
    const assistantId = `a-${messageId}`;
    setMessages((prev) => [
      ...prev,
      { id: `u-${messageId}`, role: "user", content, tools: [] },
      { id: assistantId, role: "assistant", content: "", streaming: true, tools: [] },
    ]);
    setStreaming(true);

    const abort = new AbortController();
    abortRef.current = abort;
    const url = `${CHAT_API_BASE}/chats/${encodeURIComponent(sessionId)}/messages?content=${encodeURIComponent(content)}&messageId=${messageId}`;

    void fetchEventSource(url, {
      credentials: "include",
      signal: abort.signal,
      openWhenHidden: true,
      onmessage(ev) {
        handleEvent(assistantId, ev.event, ev.data);
      },
      onerror(err) {
        setStreaming(false);
        patchAssistant(assistantId, { streaming: false });
        throw err; // stop retry loop
      },
    }).catch(() => {
      /* terminal error already surfaced on the bubble */
    });
  };

  const handleEvent = (assistantId: string, event: string, data: string): void => {
    switch (event) {
      case "token":
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + (m.content ? " " : "") + data } : m,
          ),
        );
        break;
      case "tool_start": {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, tools: [...m.tools, { name: data, done: false }] } : m,
          ),
        );
        break;
      }
      case "tool_end": {
        const parsed = safeParse<{ name: string }>(data);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  tools: m.tools.map((t) =>
                    t.name === parsed?.name ? { ...t, done: true } : t,
                  ),
                }
              : m,
          ),
        );
        break;
      }
      case "citation_missing":
        patchAssistant(assistantId, { missing: safeParse<{ missing: string[] }>(data)?.missing });
        break;
      case "refusal": {
        const r = safeParse<{ category: string; message: string }>(data);
        if (r) patchAssistant(assistantId, { refusal: r, streaming: false });
        setStreaming(false);
        break;
      }
      case "replay": {
        const r = safeParse<{ content: string; citations: ChatCitation[]; refusalCategory?: string }>(data);
        if (r) {
          patchAssistant(assistantId, {
            content: r.content,
            citations: r.citations,
            refusal: r.refusalCategory ? { category: r.refusalCategory, message: r.content } : undefined,
            streaming: false,
          });
        }
        setStreaming(false);
        break;
      }
      case "done": {
        const r = safeParse<{ citations: ChatCitation[] }>(data);
        patchAssistant(assistantId, { citations: r?.citations, streaming: false });
        setStreaming(false);
        break;
      }
      case "error":
        patchAssistant(assistantId, {
          content: "Sorry — the response failed. Please try again.",
          streaming: false,
        });
        setStreaming(false);
        break;
      default:
        break; // ignore heartbeat / comment
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4" data-testid="chat-scroll">
        {messages.map((m) =>
          m.role === "user" ? (
            <MessageBubble key={m.id} variant="user" message={{ content: m.content }} />
          ) : m.refusal ? (
            <RefusalBanner key={m.id} category={m.refusal.category} message={m.refusal.message} />
          ) : (
            <div key={m.id} className="space-y-1">
              {m.tools.map((t, i) => (
                <ToolBreadcrumb key={`${t.name}-${i}`} name={t.name} done={t.done} />
              ))}
              <MessageBubble
                variant="assistant"
                streaming={m.streaming}
                message={{ content: m.content, citations: m.citations, missing: m.missing }}
              />
            </div>
          ),
        )}
      </div>
      <ChatInput onSend={send} disabled={streaming} />
    </div>
  );
}

function safeParse<T>(data: string): T | null {
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}
