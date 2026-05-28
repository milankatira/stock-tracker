import type { StockReportDoc } from "@finsight/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

interface TechnicalsStripProps {
  readonly data: StockReportDoc["technicals"];
}

const MACD_TONE: Record<StockReportDoc["technicals"]["macdSignal"], string> = {
  bullish: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  bearish: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  neutral: "bg-muted text-muted-foreground border-border",
};

function fmtRupees(value: number): string {
  return `₹${value.toFixed(2)}`;
}

export function TechnicalsStrip({ data }: TechnicalsStripProps) {
  return (
    <section
      aria-label="Technicals strip"
      className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-4"
    >
      <div className="flex flex-col">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          RSI(14)
        </span>
        <span className="text-base font-semibold tabular-nums">
          {data.rsi14.toFixed(1)}
        </span>
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          MACD
        </span>
        <Badge variant="outline" className={cn("w-fit", MACD_TONE[data.macdSignal])}>
          {data.macdSignal}
        </Badge>
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          50/200 DMA
        </span>
        <span className="text-base font-semibold tabular-nums">
          {`50: ${fmtRupees(data.dma50)} / 200: ${fmtRupees(data.dma200)}`}
        </span>
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Beta
        </span>
        <span className="text-base font-semibold tabular-nums">
          {data.beta.toFixed(2)}
        </span>
      </div>
    </section>
  );
}
