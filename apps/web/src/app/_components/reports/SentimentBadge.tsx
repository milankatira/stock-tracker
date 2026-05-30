import type { SentimentLabel } from "@finsight/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

const COPY: Record<SentimentLabel, string> = {
  POSITIVE: "Positive",
  NEGATIVE: "Negative",
  NEUTRAL: "Neutral",
};

const TONE: Record<SentimentLabel, string> = {
  POSITIVE: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  NEGATIVE: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  NEUTRAL: "bg-zinc-500/15 text-zinc-600 border-zinc-500/30",
};

interface SentimentBadgeProps {
  readonly sentiment: SentimentLabel | null;
  readonly className?: string;
}

/**
 * Sentiment chip for a news item. Renders nothing for `null` (a
 * not-yet-classified article) so the row layout stays clean. The label
 * is AI analysis, not investment advice — see the feed-level disclaimer.
 */
export function SentimentBadge({ sentiment, className }: SentimentBadgeProps) {
  if (sentiment === null) return null;
  return (
    <Badge
      variant="outline"
      className={cn(TONE[sentiment], "shrink-0 px-2 py-0.5 text-xs", className)}
      title="Sentiment is AI analysis of the headline — not investment advice."
    >
      {COPY[sentiment]}
    </Badge>
  );
}
