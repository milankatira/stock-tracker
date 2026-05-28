import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { FundReportDoc } from "@finsight/shared";
import { getFundReport } from "@/app/_lib/reports/fetch-fund";
import { DisclaimerFooter } from "@/app/_components/reports/DisclaimerFooter";
import { NarrativeBlock } from "@/app/_components/reports/NarrativeBlock";
import {
  CardsShell,
  ChartShell,
  PeersShell,
  ScoreVerdictShell,
} from "@/app/_components/reports/ReportSkeleton";
import { FundMetaStrip } from "@/app/_components/fund-reports/FundMetaStrip";
import { FundPeerCard } from "@/app/_components/fund-reports/FundPeerCard";
import { FundScoreHeader } from "@/app/_components/fund-reports/FundScoreHeader";
import { HigherScoringPeersCard } from "@/app/_components/fund-reports/HigherScoringPeersCard";
import { HoldingsCard } from "@/app/_components/fund-reports/HoldingsCard";
import { ReturnsChart } from "@/app/_components/fund-reports/ReturnsChart";
import { RiskStrip } from "@/app/_components/fund-reports/RiskStrip";
import { SectorAllocationCard } from "@/app/_components/fund-reports/SectorAllocationCard";

interface FundReportPageProps {
  readonly params: Promise<{ readonly schemeCode: string }>;
}

async function loadDoc(schemeCode: string): Promise<FundReportDoc> {
  const doc = await getFundReport(schemeCode);
  if (!doc) notFound();
  return doc;
}

async function ScoreSection({ schemeCode }: { schemeCode: string }) {
  const doc = await loadDoc(schemeCode);
  return <FundScoreHeader doc={doc} />;
}

async function ReturnsAndRiskSection({ schemeCode }: { schemeCode: string }) {
  const doc = await loadDoc(schemeCode);
  return (
    <section className="space-y-4">
      <ReturnsChart returns={doc.returns} />
      <RiskStrip data={doc.risk} />
      <FundMetaStrip meta={doc.meta} />
    </section>
  );
}

async function HoldingsAndAllocationSection({ schemeCode }: { schemeCode: string }) {
  const doc = await loadDoc(schemeCode);
  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <HoldingsCard holdings={doc.holdings} />
      <SectorAllocationCard sectors={doc.sectorAllocation} />
    </section>
  );
}

async function PeersAndNarrativeSection({ schemeCode }: { schemeCode: string }) {
  const doc = await loadDoc(schemeCode);
  return (
    <section className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <NarrativeBlock narrative={doc.narrative} />
      </div>
      <FundPeerCard peers={doc.peers} />
      {doc.higherScoringPeers && doc.higherScoringPeers.length > 0 ? (
        <div className="lg:col-span-3">
          <HigherScoringPeersCard peers={doc.higherScoringPeers} />
        </div>
      ) : null}
    </section>
  );
}

async function DisclaimerSection({ schemeCode }: { schemeCode: string }) {
  const doc = await loadDoc(schemeCode);
  return <DisclaimerFooter disclaimers={doc.disclaimers} />;
}

export default async function FundReportPage({ params }: FundReportPageProps) {
  const { schemeCode } = await params;
  return (
    <article className="container mx-auto max-w-5xl space-y-8 px-4 py-8">
      <Suspense fallback={<ScoreVerdictShell />}>
        <ScoreSection schemeCode={schemeCode} />
      </Suspense>
      <Suspense fallback={<ChartShell />}>
        <ReturnsAndRiskSection schemeCode={schemeCode} />
      </Suspense>
      <Suspense fallback={<CardsShell />}>
        <HoldingsAndAllocationSection schemeCode={schemeCode} />
      </Suspense>
      <Suspense fallback={<PeersShell />}>
        <PeersAndNarrativeSection schemeCode={schemeCode} />
      </Suspense>
      <Suspense fallback={null}>
        <DisclaimerSection schemeCode={schemeCode} />
      </Suspense>
    </article>
  );
}
