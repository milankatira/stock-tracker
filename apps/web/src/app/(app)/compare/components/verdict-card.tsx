import type { ComparisonVerdict } from "@finsight/shared";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/cn";

interface VerdictCardProps {
  readonly verdict: ComparisonVerdict;
}

/**
 * Hero card for the comparison result (STOCK-07). Surfaces the
 * higher-scoring pick, the deterministic score delta, the sanitised
 * rationale, and the mandatory analysis-not-advice disclaimer. Calm,
 * generous treatment per the design-conscious directive — tabular numerals
 * for the delta, soft shadow, no red/green stock-app cliché.
 */
export function VerdictCard({ verdict }: VerdictCardProps) {
  const deltaPositive = verdict.scoreDelta > 0;
  return (
    <Card className="overflow-hidden shadow-md">
      <CardContent className="space-y-5 p-7">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Higher-scoring pick
          </p>
          <h2 className="font-mono text-4xl font-semibold tracking-tight">
            {verdict.winnerSymbol}
          </h2>
        </div>

        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold tabular-nums",
            deltaPositive
              ? "bg-emerald-100 text-emerald-900"
              : "bg-zinc-100 text-zinc-700",
          )}
        >
          {`${deltaPositive ? "+" : ""}${verdict.scoreDelta.toFixed(1)} vs next-best`}
        </span>

        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
          {verdict.rationale}
        </p>

        <p className="border-t border-border/60 pt-4 text-xs leading-relaxed text-muted-foreground">
          Analysis only — not investment advice. Past performance does not
          guarantee future returns.
        </p>
      </CardContent>
    </Card>
  );
}
