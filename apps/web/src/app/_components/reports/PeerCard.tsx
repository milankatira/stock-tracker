import Link from "next/link";
import type { Peer } from "@finsight/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

interface PeerCardProps {
  readonly peers: readonly Peer[];
}

function scoreTone(score: number): string {
  if (score >= 7) return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
  if (score >= 4) return "bg-amber-500/15 text-amber-600 border-amber-500/30";
  return "bg-rose-500/15 text-rose-600 border-rose-500/30";
}

export function PeerCard({ peers }: PeerCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Peers</CardTitle>
      </CardHeader>
      <CardContent>
        {peers.length === 0 ? (
          <p className="text-xs text-muted-foreground">No peers available yet.</p>
        ) : (
          <ul className="space-y-3">
            {peers.slice(0, 3).map((p) => (
              <li
                key={p.ticker}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <Link
                  href={`/stock/${encodeURIComponent(p.ticker)}`}
                  className="flex flex-col"
                  prefetch={false}
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{p.ticker}</span>
                </Link>
                <Badge variant="outline" className={cn(scoreTone(p.score), "tabular-nums")}>
                  {p.score.toFixed(1)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
