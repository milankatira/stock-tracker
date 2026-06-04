import type { ComparisonScore } from "@finsight/shared";
import { cn } from "@/lib/cn";

interface ScoreTableProps {
  readonly scores: readonly ComparisonScore[];
  readonly winnerSymbol: string;
}

const VERDICT_BADGE: Record<string, { label: string; className: string }> = {
  STRONG_SCORE: { label: "Strong Score", className: "bg-emerald-100 text-emerald-900" },
  CAUTION: { label: "Caution", className: "bg-amber-100 text-amber-900" },
  WEAK_SCORE: { label: "Weak Score", className: "bg-zinc-100 text-zinc-700" },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Per-instrument score breakdown for the comparison result. Calm verdict
 * badges (no red/green); the winner row gets a subtle accent so the eye
 * lands on the pick that the VerdictCard names.
 */
export function ScoreTable({ scores, winnerSymbol }: ScoreTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2 font-medium">Symbol</th>
            <th className="px-4 py-2 font-medium">FinSight Score</th>
            <th className="px-4 py-2 font-medium">Verdict</th>
            <th className="px-4 py-2 font-medium">As of</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((s) => {
            const badge = VERDICT_BADGE[String(s.verdict)] ?? {
              label: String(s.verdict),
              className: "bg-zinc-100 text-zinc-700",
            };
            const isWinner = s.symbol === winnerSymbol;
            return (
              <tr
                key={s.symbol}
                className={cn(
                  "border-b border-border/50 last:border-b-0",
                  isWinner && "bg-emerald-50/60",
                )}
              >
                <td className="px-4 py-3 font-mono font-medium">{s.symbol}</td>
                <td className="px-4 py-3 tabular-nums">{s.value.toFixed(1)}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold",
                      badge.className,
                    )}
                  >
                    {badge.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDate(s.asOfDate)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
