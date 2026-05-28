import type { FundHolding } from "@finsight/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface HoldingsCardProps {
  readonly holdings: readonly FundHolding[];
}

export function HoldingsCard({ holdings }: HoldingsCardProps) {
  if (holdings.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top Holdings</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Holdings not available
        </CardContent>
      </Card>
    );
  }

  const top10 = [...holdings]
    .sort((a, b) => b.weightPct - a.weightPct)
    .slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Holdings</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="py-2 pr-2">#</th>
              <th className="py-2 pr-2">Holding</th>
              <th className="py-2 pl-2 text-right">Weight</th>
            </tr>
          </thead>
          <tbody>
            {top10.map((h, i) => (
              <tr key={`${h.name}-${i}`} className="border-b border-border/40">
                <td className="py-2 pr-2 text-muted-foreground">{i + 1}</td>
                <td className="py-2 pr-2">{h.name}</td>
                <td className="py-2 pl-2 text-right">
                  {h.weightPct.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
