import Link from "next/link";
import type { HigherScoringPeer } from "@finsight/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/cn";

interface HigherScoringPeersCardProps {
  readonly peers: readonly HigherScoringPeer[];
}

/**
 * Compliance-safe higher-scoring-peers card.
 *
 * Title text is hardcoded to the exact phrase approved by the Plan 04-05
 * compliance review ("Higher-scoring peers in the same category"). The
 * body copy is purely informational; the spec
 * `HigherScoringPeersCard.test.tsx` greps the rendered DOM for the
 * forbidden compliance vocabulary (verbs held as base64 in the test
 * file) so a future refactor cannot regress us into advisory phrasing.
 */
export function HigherScoringPeersCard({ peers }: HigherScoringPeersCardProps) {
  if (peers.length === 0) return null;
  return (
    <Card aria-label="Higher-scoring peers in the same category">
      <CardHeader>
        <CardTitle>Higher-scoring peers in the same category</CardTitle>
        <p className="text-xs text-muted-foreground">
          These funds in the same category currently have a higher FinSight
          Fund Score.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {peers.slice(0, 3).map((p) => (
            <li
              key={p.schemeCode}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <Link
                href={`/app/fund/${encodeURIComponent(p.schemeCode)}`}
                className="flex flex-col"
                prefetch={false}
              >
                <span className="font-medium">{p.name}</span>
                <span className="text-xs text-muted-foreground">
                  {p.schemeCode}
                </span>
              </Link>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 bg-emerald-500/15 text-emerald-600 tabular-nums"
                >
                  {p.score.toFixed(1)}
                </Badge>
                <span
                  className={cn(
                    "text-xs font-medium tabular-nums",
                    p.scoreDelta > 0 ? "text-emerald-600" : "text-muted-foreground",
                  )}
                  aria-label={`Score delta ${p.scoreDelta}`}
                >
                  +{p.scoreDelta.toFixed(1)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
