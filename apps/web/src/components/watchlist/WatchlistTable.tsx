"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Minus, Trash2 } from "lucide-react";
import type { WatchlistItem } from "@finsight/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import {
  fetchWatchlist,
  removeWatchlistItem,
} from "@/lib/api/watchlist";

type Status = "loading" | "ready" | "error";

function scoreTone(score: number | null): string {
  if (score === null) return "bg-muted text-muted-foreground border-border";
  if (score >= 7) return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
  if (score >= 4) return "bg-amber-500/15 text-amber-600 border-amber-500/30";
  return "bg-rose-500/15 text-rose-600 border-rose-500/30";
}

function DeltaCell({ delta }: { readonly delta: number | null }) {
  if (delta === null) {
    return (
      <span className="inline-flex items-center text-muted-foreground" aria-label="No delta">
        <Minus className="h-3.5 w-3.5" aria-hidden />
      </span>
    );
  }
  if (delta > 0) {
    return (
      <span className="inline-flex items-center text-emerald-600" aria-label="Score up">
        <ArrowUp className="h-3.5 w-3.5" aria-hidden />
        <span className="ml-1 tabular-nums">+{delta.toFixed(2)}</span>
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="inline-flex items-center text-rose-600" aria-label="Score down">
        <ArrowDown className="h-3.5 w-3.5" aria-hidden />
        <span className="ml-1 tabular-nums">{delta.toFixed(2)}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-muted-foreground" aria-label="No change">
      <Minus className="h-3.5 w-3.5" aria-hidden />
      <span className="ml-1 tabular-nums">0.00</span>
    </span>
  );
}

export function WatchlistTable() {
  const [items, setItems] = React.useState<readonly WatchlistItem[]>([]);
  const [status, setStatus] = React.useState<Status>("loading");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetchWatchlist();
      setItems(res.items);
      setStatus("ready");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const onRemove = async (instrumentId: string) => {
    const snapshot = items;
    setItems(items.filter((i) => i.instrumentId !== instrumentId));
    try {
      await removeWatchlistItem(instrumentId);
    } catch {
      setItems(snapshot);
    }
  };

  if (status === "loading") {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Loading watchlist…
      </p>
    );
  }
  if (status === "error") {
    return (
      <p className="py-12 text-center text-sm text-rose-600">
        Could not load watchlist. {errorMessage}
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <div className="space-y-3 py-12 text-center">
        <p className="text-sm text-muted-foreground">Your watchlist is empty.</p>
        <Link
          href="/search"
          className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-foreground/5"
        >
          Search for instruments
        </Link>
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
          <th className="py-2 pr-2">Type</th>
          <th className="py-2 pr-2">Added</th>
          <th className="py-2 pr-2 text-right">Score</th>
          <th className="py-2 pr-2 text-right">Δ vs yesterday</th>
          <th className="py-2 pl-2 text-right">Remove</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.instrumentId} className="border-b border-border/40">
            <td className="py-3 pr-2">
              <Badge variant="outline">{item.instrumentType}</Badge>
            </td>
            <td className="py-3 pr-2 text-muted-foreground">
              {new Date(item.addedAt).toLocaleDateString("en-IN")}
            </td>
            <td className="py-3 pr-2 text-right">
              <Badge
                variant="outline"
                className={cn(scoreTone(item.latestScore), "tabular-nums")}
                title={
                  item.latestScore === null
                    ? "Updates daily — check back tomorrow"
                    : undefined
                }
              >
                {item.latestScore === null ? "—" : item.latestScore.toFixed(1)}
              </Badge>
            </td>
            <td className="py-3 pr-2 text-right text-xs">
              <DeltaCell delta={item.delta} />
            </td>
            <td className="py-3 pl-2 text-right">
              <button
                type="button"
                aria-label="Remove from watchlist"
                onClick={() => onRemove(item.instrumentId)}
                className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-foreground/5"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
