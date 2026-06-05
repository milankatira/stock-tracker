/**
 * PUBLIC, indexable fund report page (SEO-02, SEO-03, SEO-04).
 *
 * Crawler-facing route at `/fund/[schemeCode]`. Pure Server Component: data is
 * awaited at the top, the returned tree is fully synchronous so
 * `renderToStaticMarkup` and crawlers see the full report in view-source HTML.
 * No `<Suspense>`/async-child streaming, no `'use client'`, no live model SDK
 * import (SEO-04 three-layer ban). Narrative is read precomputed + already
 * compliance-audited from the materialised store.
 *
 * Next 15.5: `params` is async (`Promise<...>`), awaited before use.
 */
import type { ReactElement } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getFundReportFromMaterialisedStore,
  enqueueAdHocFundCompute,
} from "@/lib/data/fund-report";
import { getTopNFundSchemeCodes } from "@/lib/data/instrument-master";
import {
  buildFundJsonLd,
  buildBreadcrumbJsonLd,
} from "@/lib/seo/jsonld";
import { buildCanonicalFundUrl } from "@/lib/seo/canonical";
import { JsonLd } from "@/components/seo/json-ld";
import { PublicFundReportView } from "@/components/reports/public-fund-report-view";
import { StubPage } from "@/components/reports/stub-page";
import {
  ANALYSIS_DISCLAIMER,
  PAST_PERF_DISCLAIMER,
} from "@/lib/seo/disclaimers";

export const dynamicParams = true;
export const revalidate = 86400;

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://finsight.ai";
// AMFI scheme codes are numeric, <=7 digits (T-08-02).
const SCHEME_RE = /^[0-9]{1,7}$/;

interface FundPageProps {
  readonly params: Promise<{ readonly schemeCode: string }>;
}

function cacheTagsFor(schemeCode: string): readonly string[] {
  return [`fund:${schemeCode}`, "fund:report"];
}

export async function generateStaticParams(): Promise<
  Array<{ schemeCode: string }>
> {
  // Top fund cohort at build. Returns [] until Phase 2's public instrument
  // endpoint lands — the long tail still renders via ISR.
  const top = await getTopNFundSchemeCodes(2000);
  return top.map((f) => ({ schemeCode: f.schemeCode }));
}

export async function generateMetadata({
  params,
}: FundPageProps): Promise<Metadata> {
  const { schemeCode } = await params;
  if (!SCHEME_RE.test(schemeCode)) {
    return { robots: { index: false, follow: true } };
  }

  const canonical = buildCanonicalFundUrl({ schemeCode });
  const report = await getFundReportFromMaterialisedStore(schemeCode, {
    cacheTags: cacheTagsFor(schemeCode),
  });

  if (!report) {
    return {
      title: `Scheme ${schemeCode} — FinSight analysis`,
      description: `FinSight is computing a deterministic score and plain-English analysis for AMFI scheme ${schemeCode}.`,
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }

  const title = `${report.name} Score & Analysis — FinSight AI`;
  const description = report.narrative?.paragraph
    ? report.narrative.paragraph.slice(0, 160)
    : `Deterministic FinSight Fund Score and plain-English analysis for ${report.name}.`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      siteName: "FinSight AI",
      title,
      description,
      url: canonical,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: { index: true, follow: true },
  };
}

export default async function FundPage({
  params,
}: FundPageProps): Promise<ReactElement> {
  const { schemeCode } = await params;
  if (!SCHEME_RE.test(schemeCode)) notFound();

  const report = await getFundReportFromMaterialisedStore(schemeCode, {
    cacheTags: cacheTagsFor(schemeCode),
  });

  if (!report) {
    void enqueueAdHocFundCompute(schemeCode);
    return (
      <main>
        <StubPage type="fund" identifier={schemeCode} />
        <PublicDisclaimers
          analysis={ANALYSIS_DISCLAIMER}
          pastPerformance={PAST_PERF_DISCLAIMER}
        />
      </main>
    );
  }

  const canonicalUrl = buildCanonicalFundUrl({ schemeCode });
  const [productJsonLd, articleJsonLd] = buildFundJsonLd(report, {
    canonicalUrl,
  });
  const breadcrumbJsonLd = buildBreadcrumbJsonLd({
    level2: { name: "Funds", url: `${SITE}/fund` },
    leaf: { name: report.name, url: canonicalUrl },
  });

  return (
    <main>
      <JsonLd data={productJsonLd} />
      <JsonLd data={articleJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <PublicFundReportView report={report} />
      <PublicDisclaimers
        analysis={report.disclaimers.analysis}
        pastPerformance={
          report.disclaimers.pastPerformance ?? PAST_PERF_DISCLAIMER
        }
      />
    </main>
  );
}

interface PublicDisclaimersProps {
  readonly analysis: string;
  readonly pastPerformance: string;
}

/**
 * Compliance footer rendered on EVERY public fund page (report + stub).
 * Prefers the DTO's own compliance copy on the real-report path; falls back to
 * the shared constants for the stub. Both SSR tests assert "Analysis, not
 * investment advice" + "Past performance" are present in the HTML.
 */
function PublicDisclaimers({
  analysis,
  pastPerformance,
}: PublicDisclaimersProps): ReactElement {
  return (
    <footer className="container mx-auto max-w-5xl space-y-2 px-4 pb-12 pt-4 text-xs text-muted-foreground">
      <p>{analysis}</p>
      <p>{pastPerformance}</p>
    </footer>
  );
}
