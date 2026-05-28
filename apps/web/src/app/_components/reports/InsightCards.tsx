import type { StockReportDoc } from "@finsight/shared";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { InsightCard } from "./InsightCard";
import { cn } from "@/lib/cn";

interface InsightCardsProps {
  readonly doc: StockReportDoc;
}

const PILLAR_LABELS: ReadonlyArray<{ key: keyof StockReportDoc["score"]["pillars"]; label: string; weight: number }> = [
  { key: "fundamentals", label: "Fundamentals", weight: 35 },
  { key: "valuation", label: "Valuation", weight: 20 },
  { key: "technical", label: "Technical", weight: 20 },
  { key: "sentiment", label: "Sentiment", weight: 10 },
  { key: "risk", label: "Risk", weight: 10 },
  { key: "event", label: "Event", weight: 5 },
];

function fmtPct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function InsightCards({ doc }: InsightCardsProps) {
  const { score, insights } = doc;
  const { volatility, profitConsistency, eventSensitivity, swot, promoterHoldings } =
    insights;
  const sensitivityDelta =
    eventSensitivity.avgAbsReturnOnResultDay - eventSensitivity.baseline;
  const promoterDelta = promoterHoldings.deltaPctVsPrevQ;

  return (
    <section
      aria-label="Insight cards"
      className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
    >
      <InsightCard title="Score Breakdown" subtitle={`Weights v${score.weightsVersion}`}>
        <ul className="space-y-2 tabular-nums">
          {PILLAR_LABELS.map((p) => (
            <li key={p.key} className="flex items-center gap-3">
              <span className="w-28 text-xs text-muted-foreground">{p.label}</span>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted/50">
                <div
                  className="absolute left-0 top-0 h-full rounded-full bg-emerald-500/60"
                  style={{ width: `${(score.pillars[p.key] / 10) * 100}%` }}
                />
              </div>
              <span className="w-10 text-right text-xs font-medium">
                {score.pillars[p.key].toFixed(1)}
              </span>
              <span className="w-10 text-right text-xs text-muted-foreground">
                {p.weight}%
              </span>
            </li>
          ))}
        </ul>
      </InsightCard>

      <InsightCard
        title="Volatility"
        subtitle="Annualised stddev of daily returns (past 1Y)"
      >
        <p className="text-2xl font-semibold tabular-nums">
          {fmtPct(volatility.stddev1y)}
        </p>
      </InsightCard>

      <InsightCard
        title="Profit Consistency"
        subtitle="Quarters in profit (last 12)"
      >
        <p className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">
            {fmtPct(profitConsistency.profitableQuartersPct, 0)}
          </span>
          <Badge variant="secondary" className="text-xs">
            {profitConsistency.window} window
          </Badge>
        </p>
      </InsightCard>

      <InsightCard
        title="Event Sensitivity"
        subtitle="Avg abs return on result day vs baseline"
      >
        <p className="flex items-center gap-2 text-2xl font-semibold tabular-nums">
          {fmtPct(eventSensitivity.avgAbsReturnOnResultDay)}
          <span
            className={cn(
              "inline-flex items-center text-xs",
              sensitivityDelta > 0 ? "text-rose-600" : "text-emerald-600",
            )}
            aria-label={
              sensitivityDelta > 0
                ? "above baseline"
                : "at or below baseline"
            }
          >
            {sensitivityDelta > 0 ? (
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            ) : (
              <ArrowDownRight className="h-4 w-4" aria-hidden />
            )}
            {sensitivityDelta >= 0 ? "+" : ""}
            {sensitivityDelta.toFixed(1)}%
          </span>
        </p>
      </InsightCard>

      <InsightCard title="SWOT">
        <div className="grid grid-cols-2 gap-3 text-xs">
          {[
            { label: "Strengths", values: swot.strengths },
            { label: "Weaknesses", values: swot.weaknesses },
            { label: "Opportunities", values: swot.opportunities },
            { label: "Threats", values: swot.threats },
          ].map((quad, idx) => (
            <div key={quad.label} className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {quad.label}
              </p>
              {quad.values.length > 0 ? (
                <ul className="list-disc space-y-0.5 pl-3">
                  {quad.values.slice(0, 3).map((v, i) => (
                    <li key={`${quad.label}-${i}`}>{v}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">—</p>
              )}
              {idx < 3 ? <Separator className="mt-2" /> : null}
            </div>
          ))}
        </div>
      </InsightCard>

      <InsightCard title="Promoter Holdings" subtitle="Latest quarter">
        <p className="text-2xl font-semibold tabular-nums">
          {fmtPct(promoterHoldings.latestPct, 2)}
        </p>
        <p
          className={cn(
            "mt-1 inline-flex items-center gap-1 text-xs",
            promoterDelta >= 0 ? "text-emerald-600" : "text-rose-600",
          )}
        >
          {promoterDelta >= 0 ? (
            <ArrowUpRight className="h-3 w-3" aria-hidden />
          ) : (
            <ArrowDownRight className="h-3 w-3" aria-hidden />
          )}
          {promoterDelta >= 0 ? "+" : ""}
          {promoterDelta.toFixed(2)}% vs previous quarter
        </p>
      </InsightCard>
    </section>
  );
}
