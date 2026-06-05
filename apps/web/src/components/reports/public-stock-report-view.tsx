/**
 * Auth-stripped, server-rendered stock report view for the PUBLIC SEO page.
 *
 * Deliberately NOT a re-export of the authenticated `(app)` report. It renders
 * only the indexable, compliance-safe subset:
 *   - FinSight Score gauge + verdict label
 *   - one-line summary + precomputed narrative (already compliance-sanitised
 *     by the Phase-4 ComplianceInterceptor at write time)
 *   - fundamentals + technicals strips
 *   - peer comparison as internal <a> links (same tab, no target=_blank)
 *
 * Explicitly OMITTED: Ask FinSight teaser, regenerate button, admin tooltips,
 * any interactive client component that would pull the live model SDK. No
 * `'use client'`, no model-SDK import (enforced by the three-layer ban).
 */
import type { ReactElement } from "react";
import type { StockReportDoc } from "@finsight/shared";
import { ScoreGauge } from "@/app/_components/reports/ScoreGauge";
import { VerdictBadge } from "@/app/_components/reports/VerdictBadge";
import { FundamentalsStrip } from "@/app/_components/reports/FundamentalsStrip";
import { TechnicalsStrip } from "@/app/_components/reports/TechnicalsStrip";

interface PublicStockReportViewProps {
  readonly report: StockReportDoc;
}

export function PublicStockReportView({
  report,
}: PublicStockReportViewProps): ReactElement {
  return (
    <article className="container mx-auto max-w-5xl space-y-8 px-4 py-8">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            FinSight Score
          </p>
          <ScoreGauge score={report.score.value} verdict={report.score.verdict} />
        </div>
        <div className="flex-1 space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            {report.name}{" "}
            <span className="text-xl text-muted-foreground">
              ({report.ticker})
            </span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {report.sector} · as of{" "}
            {new Date(report.asOf).toLocaleDateString("en-IN")}
          </p>
          <div className="pt-1">
            <VerdictBadge verdict={report.score.verdict} />
          </div>
          {report.narrative ? (
            <p className="pt-2 text-base leading-relaxed text-foreground">
              {report.narrative.paragraph}
            </p>
          ) : null}
        </div>
      </header>

      <section className="space-y-4">
        <FundamentalsStrip data={report.fundamentals} />
        <TechnicalsStrip data={report.technicals} />
      </section>

      {report.peers.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Peers</h2>
          <ul className="flex flex-wrap gap-2">
            {report.peers.map((peer) => (
              <li key={peer.ticker}>
                <a
                  href={`/stock/${encodeURIComponent(peer.ticker)}`}
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                >
                  {peer.name}{" "}
                  <span className="text-muted-foreground">
                    ({peer.score}/10)
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
