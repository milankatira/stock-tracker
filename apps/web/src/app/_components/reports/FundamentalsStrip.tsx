import type { StockReportDoc } from "@finsight/shared";
import { Tooltip } from "@/components/ui/tooltip";

interface FundamentalsStripProps {
  readonly data: StockReportDoc["fundamentals"];
}

interface Metric {
  readonly key: keyof StockReportDoc["fundamentals"];
  readonly label: string;
  readonly definition: string;
  readonly format: (value: number) => string;
}

function formatMarketCap(crores: number): string {
  if (crores >= 100_000) return `₹${(crores / 100_000).toFixed(2)}L Cr`;
  if (crores >= 1_000) return `₹${(crores / 1_000).toFixed(2)}k Cr`;
  return `₹${crores.toFixed(0)} Cr`;
}

const METRICS: readonly Metric[] = [
  {
    key: "pe",
    label: "P/E",
    definition: "Price to Earnings — price per ₹1 of annual earnings.",
    format: (v) => v.toFixed(1),
  },
  {
    key: "pb",
    label: "P/B",
    definition: "Price to Book — price per ₹1 of book value.",
    format: (v) => v.toFixed(2),
  },
  {
    key: "roe",
    label: "ROE",
    definition: "Return on Equity — profit per ₹1 of equity, annualised.",
    format: (v) => `${v.toFixed(1)}%`,
  },
  {
    key: "roce",
    label: "ROCE",
    definition: "Return on Capital Employed — profit per ₹1 of capital deployed.",
    format: (v) => `${v.toFixed(1)}%`,
  },
  {
    key: "debtEquity",
    label: "D/E",
    definition: "Debt to Equity — total debt as a multiple of equity.",
    format: (v) => v.toFixed(2),
  },
  {
    key: "marketCap",
    label: "Mkt Cap",
    definition: "Total market value of all outstanding shares.",
    format: formatMarketCap,
  },
];

export function FundamentalsStrip({ data }: FundamentalsStripProps) {
  return (
    <section
      aria-label="Fundamentals strip"
      className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-6"
    >
      {METRICS.map((m) => (
        <Tooltip key={m.key} content={m.definition}>
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {m.label}
            </span>
            <span className="text-base font-semibold tabular-nums">
              {m.format(data[m.key])}
            </span>
          </div>
        </Tooltip>
      ))}
    </section>
  );
}
