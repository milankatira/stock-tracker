/**
 * Auth-stripped, server-rendered fund report view for the PUBLIC SEO page.
 *
 * Mirrors `public-stock-report-view.tsx`: indexable, compliance-safe subset
 * only. Returns are rendered as an SSR table (NOT the client `ReturnsChart`)
 * so the figures are present in view-source HTML and the page stays a pure
 * Server Component. No Ask FinSight teaser, no model-SDK import.
 */
import type { ReactElement } from "react";
import type { FundReportDoc, FundReturnsBucket } from "@finsight/shared";
import { ScoreGauge } from "@/app/_components/reports/ScoreGauge";
import { VerdictBadge } from "@/app/_components/reports/VerdictBadge";
import { FundMetaStrip } from "@/app/_components/fund-reports/FundMetaStrip";
import { RiskStrip } from "@/app/_components/fund-reports/RiskStrip";
import { HoldingsCard } from "@/app/_components/fund-reports/HoldingsCard";

interface PublicFundReportViewProps {
  readonly report: FundReportDoc;
}

const RETURN_WINDOWS: readonly (keyof FundReturnsBucket)[] = [
  "1y",
  "3y",
  "5y",
  "10y",
];

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function PublicFundReportView({
  report,
}: PublicFundReportViewProps): ReactElement {
  return (
    <article className="container mx-auto max-w-5xl space-y-8 px-4 py-8">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            FinSight Fund Score
          </p>
          <ScoreGauge score={report.score.value} verdict={report.score.verdict} />
        </div>
        <div className="flex-1 space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            {report.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {report.category} · as of{" "}
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

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Returns</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1">Period</th>
              <th className="py-1">Fund</th>
              <th className="py-1">Benchmark</th>
              <th className="py-1">Category</th>
            </tr>
          </thead>
          <tbody>
            {RETURN_WINDOWS.map((w) => (
              <tr key={w} className="border-t">
                <td className="py-1 font-medium uppercase">{w}</td>
                <td className="py-1">{pct(report.returns.fund[w])}</td>
                <td className="py-1">{pct(report.returns.benchmark[w])}</td>
                <td className="py-1">{pct(report.returns.category[w])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <RiskStrip data={report.risk} />
      <FundMetaStrip meta={report.meta} />
      {report.holdings.length > 0 ? (
        <HoldingsCard holdings={report.holdings} />
      ) : null}

      {report.peers.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Peer funds</h2>
          <ul className="flex flex-wrap gap-2">
            {report.peers.map((peer) => (
              <li key={peer.schemeCode}>
                <a
                  href={`/fund/${peer.schemeCode}`}
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
