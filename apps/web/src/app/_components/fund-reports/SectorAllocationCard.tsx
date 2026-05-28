import type { FundSectorWeight } from "@finsight/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SectorAllocationCardProps {
  readonly sectors: readonly FundSectorWeight[];
}

export function SectorAllocationCard({ sectors }: SectorAllocationCardProps) {
  if (sectors.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sector Allocation</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Allocation not available
        </CardContent>
      </Card>
    );
  }
  const sorted = [...sectors].sort((a, b) => b.weightPct - a.weightPct);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sector Allocation</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {sorted.map((s) => (
            <li key={s.sector} className="text-sm">
              <div className="flex items-center justify-between">
                <span>{s.sector}</span>
                <span className="font-medium tabular-nums">
                  {s.weightPct.toFixed(1)}%
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
                <div
                  className="h-full rounded-full bg-blue-500/60"
                  style={{ width: `${Math.min(100, s.weightPct)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
