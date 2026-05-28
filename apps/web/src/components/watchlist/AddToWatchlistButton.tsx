"use client";

import * as React from "react";
import { Star } from "lucide-react";
import {
  addWatchlistItem,
  removeWatchlistItem,
} from "@/lib/api/watchlist";
import { cn } from "@/lib/cn";

interface AddToWatchlistButtonProps {
  readonly instrumentId: string;
  readonly instrumentType: "STOCK" | "FUND";
  readonly initiallyInWatchlist?: boolean;
  readonly className?: string;
}

type Status = "idle" | "pending" | "error";

export function AddToWatchlistButton({
  instrumentId,
  instrumentType,
  initiallyInWatchlist = false,
  className,
}: AddToWatchlistButtonProps) {
  const [inWatchlist, setInWatchlist] = React.useState(initiallyInWatchlist);
  const [status, setStatus] = React.useState<Status>("idle");

  const toggle = async () => {
    const wasIn = inWatchlist;
    setInWatchlist(!wasIn);
    setStatus("pending");
    try {
      if (wasIn) {
        await removeWatchlistItem(instrumentId);
      } else {
        await addWatchlistItem({ instrumentId, instrumentType });
      }
      setStatus("idle");
    } catch {
      setInWatchlist(wasIn);
      setStatus("error");
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={inWatchlist}
      aria-label={
        inWatchlist ? "Remove from watchlist" : "Add to watchlist"
      }
      disabled={status === "pending"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-foreground/5 disabled:opacity-60",
        className,
      )}
    >
      <Star
        className={cn(
          "h-4 w-4",
          inWatchlist ? "fill-amber-400 text-amber-500" : "text-muted-foreground",
        )}
        aria-hidden
      />
      {inWatchlist ? "In watchlist" : "Add to watchlist"}
    </button>
  );
}
