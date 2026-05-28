import type { FundRisk } from "@finsight/shared";
import { Tooltip } from "@/components/ui/tooltip";

interface RiskStripProps {
  readonly data: FundRisk;
}

const DEFINITIONS = {
  sharpe1y: "Excess return per unit of total risk over the past 1Y.",
  stddev1y: "Annualised standard deviation of daily returns (1Y).",
  maxDrawdown1y:
    "Largest peak-to-trough decline over the past 1Y. More negative = worse.",
} as const;

export function RiskStrip({ data }: RiskStripProps) {
  return (
    <section
      aria-label="Risk strip"
      className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-3"
    >
      <Tooltip content={DEFINITIONS.sharpe1y}>
        <div className="flex flex-col">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Sharpe (1Y)
          </span>
          <span className="text-base font-semibold tabular-nums">
            {data.sharpe1y.toFixed(2)}
          </span>
        </div>
      </Tooltip>
      <Tooltip content={DEFINITIONS.stddev1y}>
        <div className="flex flex-col">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Std Dev (1Y)
          </span>
          <span className="text-base font-semibold tabular-nums">
            {data.stddev1y.toFixed(1)}%
          </span>
        </div>
      </Tooltip>
      <Tooltip content={DEFINITIONS.maxDrawdown1y}>
        <div className="flex flex-col">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Max Drawdown (1Y)
          </span>
          <span className="text-base font-semibold tabular-nums text-rose-600">
            {(data.maxDrawdown1y * 100).toFixed(1)}%
          </span>
        </div>
      </Tooltip>
    </section>
  );
}
