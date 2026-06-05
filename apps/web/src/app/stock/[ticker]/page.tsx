/**
 * PUBLIC, indexable stock report page (SEO-01, SEO-03, SEO-04).
 *
 * This is the crawler-facing route at `/stock/[ticker]`. It is a pure Server
 * Component: all data is awaited at the top and the returned tree is fully
 * synchronous so `renderToStaticMarkup` (and crawlers) see the full report in
 * view-source HTML — no `<Suspense>`/async-child streaming, no `'use client'`.
 *
 * AI-SDK ban (SEO-04): this file and `PublicStockReportView` never import the
 * live model SDK. The narrative is read precomputed from the materialised
 * store (Gemini already ran + was compliance-audited at write time). Enforced
 * by the three-layer ban (static scan, CI grep, runtime mock-throw tests).
 *
 * Next 15.5: `params` is async (`Promise<...>`), awaited before use.
 */
import type { ReactElement } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getStockReportFromMaterialisedStore,
  enqueueAdHocStockCompute,
} from "@/lib/data/stock-report";
import {
  getTopNTickers,
  getStockInstrument,
} from "@/lib/data/instrument-master";
import {
  buildStockJsonLd,
  buildBreadcrumbJsonLd,
} from "@/lib/seo/jsonld";
import { buildCanonicalStockUrl } from "@/lib/seo/canonical";
import { JsonLd } from "@/components/seo/json-ld";
import { PublicStockReportView } from "@/components/reports/public-stock-report-view";
import { StubPage } from "@/components/reports/stub-page";
import {
  ANALYSIS_DISCLAIMER,
  PAST_PERF_DISCLAIMER,
} from "@/lib/seo/disclaimers";

// Long-tail tickers render on-demand via ISR; top cohort prerenders at build.
export const dynamicParams = true;
// 24h safety floor — Plan 02 wires the precise revalidateTag webhook.
export const revalidate = 86400;

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://finsight.ai";
// Real NSE symbols are uppercase alnum plus & . - _ (e.g. M&M, M&MFIN,
// J&KBANK, L&TFH, BAJAJ-AUTO), bounded length (T-08-01). Rejecting `&`/`.`
// would 404 + de-index major-cap pages (CR-01).
const TICKER_RE = /^[A-Z0-9&.\-_]{1,15}$/;

interface StockPageProps {
  readonly params: Promise<{ readonly ticker: string }>;
}

function cacheTagsFor(ticker: string): readonly string[] {
  return [`stock:${ticker}`, "stock:report"];
}

async function resolveExchangeMeta(
  ticker: string,
): Promise<{ exchange: "NSE" | "BSE"; nseSymbol?: string }> {
  // Dual-listing canonical preference. Null until Phase 2 exposes a public
  // instrument endpoint; the route symbol (NSE-as-ticker) is the correct
  // fallback for every non-dual-listed stock and NSE-routed dual listings.
  const instrument = await getStockInstrument(ticker);
  if (!instrument) return { exchange: "NSE" };
  return {
    exchange: instrument.primaryExchange === "BSE" ? "BSE" : "NSE",
    nseSymbol: instrument.nseSymbol,
  };
}

export async function generateStaticParams(): Promise<
  Array<{ ticker: string }>
> {
  // Top NIFTY-500 cohort at build. Returns [] until Phase 2's public
  // instrument endpoint lands — the long tail still renders via ISR.
  const top = await getTopNTickers(500);
  return top.map((t) => ({ ticker: t.symbol }));
}

export async function generateMetadata({
  params,
}: StockPageProps): Promise<Metadata> {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();
  if (!TICKER_RE.test(upper)) {
    return { robots: { index: false, follow: true } };
  }

  const { exchange, nseSymbol } = await resolveExchangeMeta(upper);
  const canonical = buildCanonicalStockUrl({
    symbol: upper,
    exchange,
    nseSymbol,
  });

  const report = await getStockReportFromMaterialisedStore(upper, {
    cacheTags: cacheTagsFor(upper),
  });

  if (!report) {
    // Long-tail stub: thin page, never indexed (it has no score/verdict yet).
    return {
      title: `${upper} — FinSight analysis`,
      description: `FinSight is computing a deterministic score and plain-English analysis for ${upper}.`,
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }

  const title = `${report.name} (${report.ticker}) Score & Analysis — FinSight AI`;
  const description = report.narrative?.paragraph
    ? report.narrative.paragraph.slice(0, 160)
    : `Deterministic FinSight Score and plain-English analysis for ${report.name}.`;

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

export default async function StockPage({
  params,
}: StockPageProps): Promise<ReactElement> {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();
  if (!TICKER_RE.test(upper)) notFound();

  const report = await getStockReportFromMaterialisedStore(upper, {
    cacheTags: cacheTagsFor(upper),
  });

  if (!report) {
    // Fire-and-forget ad-hoc compute; never awaited on the request path. The
    // explicit `.catch` makes this robust regardless of callee internals — a
    // future edit moving work outside the callee's try/catch can't surface an
    // unhandled rejection that crashes the request (WR-03).
    void enqueueAdHocStockCompute(upper).catch(() => undefined);
    return (
      <main>
        <StubPage type="stock" identifier={upper} />
        <PublicDisclaimers
          analysis={ANALYSIS_DISCLAIMER}
          pastPerformance={PAST_PERF_DISCLAIMER}
        />
      </main>
    );
  }

  const { exchange, nseSymbol } = await resolveExchangeMeta(upper);
  const canonicalUrl = buildCanonicalStockUrl({
    symbol: upper,
    exchange,
    nseSymbol,
  });
  const [corpJsonLd, articleJsonLd] = buildStockJsonLd(report, {
    exchange,
    canonicalUrl,
  });
  const breadcrumbJsonLd = buildBreadcrumbJsonLd({
    level2: { name: "Stocks", url: `${SITE}/stock` },
    leaf: { name: report.name, url: canonicalUrl },
  });

  return (
    <main>
      <JsonLd data={corpJsonLd} />
      <JsonLd data={articleJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <PublicStockReportView report={report} />
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
 * Compliance footer rendered on EVERY public stock page (report + stub).
 * Prefers the DTO's own compliance copy on the real-report path; falls back to
 * the shared constants for the stub (which has no DTO). Both SSR tests assert
 * "Analysis, not investment advice" + "Past performance" are present.
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
