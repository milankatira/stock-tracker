import type { FundMeta } from "@finsight/shared";

interface FundMetaStripProps {
  readonly meta: FundMeta;
}

function formatAum(crores: number): string {
  if (crores >= 100_000) return `₹${(crores / 100_000).toFixed(2)}L Cr`;
  if (crores >= 1_000) return `₹${(crores / 1_000).toFixed(2)}k Cr`;
  return `₹${crores.toFixed(0)} Cr`;
}

export function FundMetaStrip({ meta }: FundMetaStripProps) {
  return (
    <section
      aria-label="Fund meta strip"
      className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-4"
    >
      <div className="flex flex-col">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Expense Ratio
        </span>
        <span className="text-base font-semibold tabular-nums">
          {meta.expenseRatioPct.toFixed(2)}%
        </span>
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          AUM
        </span>
        <span className="text-base font-semibold tabular-nums">
          {formatAum(meta.aumCr)}
        </span>
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Manager
        </span>
        <span className="text-sm font-medium truncate">{meta.managerName}</span>
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Tenure
        </span>
        <span className="text-base font-semibold tabular-nums">
          {meta.managerTenureYears.toFixed(1)}y
        </span>
      </div>
    </section>
  );
}
