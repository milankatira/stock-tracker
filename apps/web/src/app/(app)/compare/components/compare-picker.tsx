"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { InstrumentMatch } from "@finsight/shared";
import { InstrumentSearch } from "@/components/search/InstrumentSearch";
import { cn } from "@/lib/cn";

const MIN_PICKS = 2;
const MAX_PICKS = 3;

interface Picked {
  readonly symbol: string;
  readonly name: string;
}

/**
 * Compare picker (STOCK-07). Lets a user select 2-3 NSE/BSE stocks via the
 * Phase-5 autocomplete, shows them as removable slot chips, and on submit
 * navigates to `/compare/result?symbols=A,B,C`. Symbols are uppercased
 * before navigation so they match the backend DTO regex (T-07-30).
 */
export function ComparePicker() {
  const router = useRouter();
  const [picks, setPicks] = React.useState<readonly Picked[]>([]);

  const addPick = (match: InstrumentMatch) => {
    if (match.type !== "STOCK") return; // comparison is stock-scoped
    const symbol = match.symbol.toUpperCase();
    setPicks((prev) => {
      if (prev.length >= MAX_PICKS || prev.some((p) => p.symbol === symbol)) {
        return prev;
      }
      return [...prev, { symbol, name: match.name }];
    });
  };

  const removePick = (symbol: string) => {
    setPicks((prev) => prev.filter((p) => p.symbol !== symbol));
  };

  const canSubmit = picks.length >= MIN_PICKS;
  const canAddMore = picks.length < MAX_PICKS;

  const submit = () => {
    if (!canSubmit) return;
    const query = picks.map((p) => p.symbol).join(",");
    router.push(`/compare/result?symbols=${encodeURIComponent(query)}`);
  };

  const slots = Array.from({ length: MAX_PICKS }, (_, i) => picks[i]);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {slots.map((pick, i) => (
          <div
            key={pick?.symbol ?? `slot-${i}`}
            className={cn(
              "flex min-h-[64px] items-center justify-between rounded-lg border px-4 py-3",
              pick
                ? "border-border bg-card"
                : "border-dashed border-border/70 bg-muted/30 text-muted-foreground",
            )}
          >
            {pick ? (
              <>
                <div className="min-w-0">
                  <p className="font-mono text-sm font-medium">{pick.symbol}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {pick.name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removePick(pick.symbol)}
                  aria-label={`Remove ${pick.symbol}`}
                  className="ml-2 shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-foreground/5"
                >
                  ✕
                </button>
              </>
            ) : (
              <span className="text-sm">+ Add a stock</span>
            )}
          </div>
        ))}
      </div>

      {canAddMore ? (
        <InstrumentSearch
          onSelect={addPick}
          placeholder="Search an NSE or BSE stock…"
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          Maximum of {MAX_PICKS} instruments selected.
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className={cn(
          "w-full rounded-md px-4 py-2.5 text-sm font-semibold transition-colors sm:w-auto",
          canSubmit
            ? "bg-foreground text-background hover:bg-foreground/90"
            : "cursor-not-allowed bg-muted text-muted-foreground",
        )}
      >
        Compare {picks.length >= 1 ? `(${picks.length})` : ""}
      </button>
    </div>
  );
}
