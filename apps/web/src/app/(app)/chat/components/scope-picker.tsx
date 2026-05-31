"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import type { InstrumentMatch } from "@finsight/shared";
import { InstrumentSearch } from "@/components/search/InstrumentSearch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { createChat, type ChatScopeType } from "@/lib/chat-api";

const TYPES: { value: ChatScopeType; label: string }[] = [
  { value: "stock", label: "Stock" },
  { value: "fund", label: "Fund" },
  { value: "portfolio", label: "Portfolio" },
  { value: "compare", label: "Compare" },
];

const MAX_SYMBOLS = 3;

/** New-chat scope picker (CHAT-05). Picks a type + 1–3 instruments, then creates the session. */
export function ScopePicker() {
  const router = useRouter();
  const [type, setType] = React.useState<ChatScopeType>("stock");
  const [symbols, setSymbols] = React.useState<string[]>([]);
  const [title, setTitle] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const addSymbol = (m: InstrumentMatch): void => {
    setSymbols((prev) =>
      prev.includes(m.symbol) || prev.length >= MAX_SYMBOLS ? prev : [...prev, m.symbol],
    );
  };
  const removeSymbol = (s: string): void =>
    setSymbols((prev) => prev.filter((x) => x !== s));

  const start = async (): Promise<void> => {
    if (symbols.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const session = await createChat({
        title: title.trim() || `${TYPES.find((t) => t.value === type)?.label} · ${symbols.join(", ")}`,
        scope: { type, symbols },
      });
      router.push(`/chat/${session._id}`);
    } catch {
      setError("Could not start the chat. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium">What do you want to analyse?</p>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm transition-colors",
                type === t.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-muted",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">
          Instruments <span className="text-muted-foreground">({symbols.length}/{MAX_SYMBOLS})</span>
        </p>
        {symbols.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {symbols.map((s) => (
              <Badge key={s} variant="secondary" className="gap-1">
                {s}
                <button type="button" onClick={() => removeSymbol(s)} aria-label={`Remove ${s}`}>
                  <X className="size-3" aria-hidden />
                </button>
              </Badge>
            ))}
          </div>
        ) : null}
        {symbols.length < MAX_SYMBOLS ? <InstrumentSearch onSelect={addSymbol} /> : null}
      </div>

      <div className="space-y-2">
        <label htmlFor="chat-title" className="text-sm font-medium">
          Title <span className="text-muted-foreground">(optional)</span>
        </label>
        <input
          id="chat-title"
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 120))}
          placeholder="Auto-generated if left blank"
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <button
        type="button"
        onClick={() => void start()}
        disabled={symbols.length === 0 || busy}
        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
      >
        {busy ? "Starting…" : "Start chat"}
      </button>
    </div>
  );
}
