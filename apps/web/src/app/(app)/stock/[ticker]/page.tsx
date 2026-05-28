import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { StockReportDoc } from "@finsight/shared";
import { getStockReport } from "@/app/_lib/reports/fetch";
import { DisclaimerFooter } from "@/app/_components/reports/DisclaimerFooter";
import { FundamentalsStrip } from "@/app/_components/reports/FundamentalsStrip";
import { InsightCards } from "@/app/_components/reports/InsightCards";
import { NarrativeBlock } from "@/app/_components/reports/NarrativeBlock";
import { PeerCard } from "@/app/_components/reports/PeerCard";
import { PriceChart } from "@/app/_components/reports/PriceChart";
import {
  CardsShell,
  ChartShell,
  PeersShell,
  ScoreVerdictShell,
} from "@/app/_components/reports/ReportSkeleton";
import { ScoreGauge } from "@/app/_components/reports/ScoreGauge";
import { TechnicalsStrip } from "@/app/_components/reports/TechnicalsStrip";
import { VerdictBadge } from "@/app/_components/reports/VerdictBadge";

interface StockReportPageProps {
  readonly params: Promise<{ readonly ticker: string }>;
}

async function loadDoc(ticker: string): Promise<StockReportDoc> {
  const doc = await getStockReport(ticker);
  if (!doc) notFound();
  return doc;
}

async function ScoreAndVerdictSection({ ticker }: { ticker: string }) {
  const doc = await loadDoc(ticker);
  return (
    <header className="flex flex-col gap-6 sm:flex-row sm:items-center">
      <ScoreGauge score={doc.score.value} verdict={doc.score.verdict} />
      <div className="flex-1 space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {doc.name}{" "}
          <span className="text-xl text-muted-foreground">({doc.ticker})</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          {doc.sector} · as of {new Date(doc.asOf).toLocaleDateString("en-IN")}
        </p>
        <div className="pt-1">
          <VerdictBadge verdict={doc.score.verdict} />
        </div>
      </div>
    </header>
  );
}

async function ChartSection({ ticker }: { ticker: string }) {
  const doc = await loadDoc(ticker);
  return (
    <section className="space-y-4">
      <PriceChart ticker={ticker} />
      <FundamentalsStrip data={doc.fundamentals} />
      <TechnicalsStrip data={doc.technicals} />
    </section>
  );
}

async function CardsSection({ ticker }: { ticker: string }) {
  const doc = await loadDoc(ticker);
  return <InsightCards doc={doc} />;
}

async function NarrativeAndPeersSection({ ticker }: { ticker: string }) {
  const doc = await loadDoc(ticker);
  return (
    <section className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <NarrativeBlock narrative={doc.narrative} />
      </div>
      <PeerCard peers={doc.peers} />
    </section>
  );
}

async function DisclaimerSection({ ticker }: { ticker: string }) {
  const doc = await loadDoc(ticker);
  return <DisclaimerFooter disclaimers={doc.disclaimers} />;
}

export default async function StockReportPage({ params }: StockReportPageProps) {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();
  return (
    <article className="container mx-auto max-w-5xl space-y-8 px-4 py-8">
      <Suspense fallback={<ScoreVerdictShell />}>
        <ScoreAndVerdictSection ticker={upper} />
      </Suspense>
      <Suspense fallback={<ChartShell />}>
        <ChartSection ticker={upper} />
      </Suspense>
      <Suspense fallback={<CardsShell />}>
        <CardsSection ticker={upper} />
      </Suspense>
      <Suspense fallback={<PeersShell />}>
        <NarrativeAndPeersSection ticker={upper} />
      </Suspense>
      <Suspense fallback={null}>
        <DisclaimerSection ticker={upper} />
      </Suspense>
    </article>
  );
}
