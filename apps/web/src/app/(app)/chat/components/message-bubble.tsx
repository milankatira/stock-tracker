import { cn } from "@/lib/cn";
import type { ChatCitation } from "@/lib/chat-api";
import { CitationPill } from "./citation-pill";

export interface BubbleMessage {
  readonly content: string;
  readonly citations?: ChatCitation[];
  readonly missing?: string[];
}

interface MessageBubbleProps {
  readonly variant: "user" | "assistant";
  readonly message: BubbleMessage;
  readonly streaming?: boolean;
}

const DISCLAIMER =
  "Analysis only — not investment advice. Past performance does not guarantee future returns.";

/** Renders assistant content as plain text (React escapes — no XSS, T-07-20). */
export function MessageBubble({ variant, message, streaming }: MessageBubbleProps) {
  const isUser = variant === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
          isUser
            ? "bg-muted text-foreground"
            : "border bg-card text-card-foreground shadow-sm",
        )}
      >
        <p className="whitespace-pre-wrap leading-relaxed">
          {message.content}
          {streaming ? (
            <span className="ml-0.5 inline-block animate-pulse" aria-hidden>
              ▋
            </span>
          ) : null}
        </p>

        {!isUser && message.missing && message.missing.length > 0 ? (
          <p className="mt-2 text-xs text-amber-600">
            ⚠ Unverified figures: {message.missing.join(", ")} — treat as [verify].
          </p>
        ) : null}

        {!isUser && message.citations && message.citations.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.citations.map((c, i) => (
              <CitationPill key={`${c.sourceTag}-${i}`} citation={c} />
            ))}
          </div>
        ) : null}

        {!isUser && !streaming ? (
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{DISCLAIMER}</p>
        ) : null}
      </div>
    </div>
  );
}
