import type { Narrative } from "@finsight/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface NarrativeBlockProps {
  readonly narrative: Narrative | null;
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "recently";
  const diffMs = Date.now() - then;
  const m = Math.floor(diffMs / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function NarrativeBlock({ narrative }: NarrativeBlockProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Narrative</CardTitle>
      </CardHeader>
      <CardContent>
        {narrative === null ? (
          <p className="text-sm text-muted-foreground">
            Narrative being generated. Refresh shortly.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-base leading-relaxed">{narrative.paragraph}</p>
            <p className="text-xs text-muted-foreground">
              Based on: {narrative.citedSources.join(", ") || "score"} ·
              Generated {timeAgo(narrative.generatedAt)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
