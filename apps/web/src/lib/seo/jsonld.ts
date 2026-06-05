/**
 * Typed JSON-LD builders for the public SEO pages (SEO-03a).
 *
 * Emits ONLY: Corporation (stocks) / FinancialProduct (funds) + Article +
 * BreadcrumbList. Explicitly NO `Review`, `Rating`, or `aggregateRating` —
 * the FinSight Score must never be exposed as a machine-readable rating
 * entity (SEBI safety: we publish "analysis," not an advisory rating).
 *
 * Types come from `schema-dts` so the shapes stay schema.org-correct at
 * compile time. We return plain objects (no `@context` on the inner blocks —
 * the page wraps them) keyed by `@type` so the SSR/unit tests can assert on
 * the emitted structure.
 */
import type {
  Corporation,
  FinancialProduct,
  Article,
  BreadcrumbList,
  WithContext,
} from "schema-dts";
import type { StockReportDoc, FundReportDoc } from "@finsight/shared";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://finsight.ai";
const PUBLISHER = {
  "@type": "Organization" as const,
  name: "FinSight AI",
  url: SITE,
};

/** Maps the branded verdict enum to its display label (mirrors VerdictBadge). */
const VERDICT_LABEL: Record<string, string> = {
  STRONG_SCORE: "Strong Score",
  CAUTION: "Caution",
  WEAK_SCORE: "Weak Score",
};

export function verdictLabel(verdict: string): string {
  return VERDICT_LABEL[verdict] ?? "Score";
}

/** First sentence of the narrative, used as the Article description / summary. */
function summaryOf(paragraph: string | null | undefined, fallback: string): string {
  if (!paragraph) return fallback;
  return paragraph;
}

export interface StockJsonLdOptions {
  readonly exchange: "NSE" | "BSE";
  readonly canonicalUrl: string;
}

export function buildStockJsonLd(
  report: StockReportDoc,
  options: StockJsonLdOptions,
): [WithContext<Corporation>, WithContext<Article>] {
  const corp: WithContext<Corporation> = {
    "@context": "https://schema.org",
    "@type": "Corporation",
    name: report.name,
    // schema.org Corporation.tickerSymbol — space-separated "<EXCHANGE> <SYMBOL>".
    tickerSymbol: `${options.exchange} ${report.ticker}`,
    url: options.canonicalUrl,
  };

  const article: WithContext<Article> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${report.name} (${report.ticker}) — FinSight Score & Analysis`,
    description: summaryOf(
      report.narrative?.paragraph,
      `Deterministic FinSight Score and plain-English analysis for ${report.name}.`,
    ),
    datePublished: report.asOf,
    dateModified: report.asOf,
    author: PUBLISHER,
    publisher: PUBLISHER,
    mainEntityOfPage: options.canonicalUrl,
    about: { "@type": "Corporation", name: report.name },
  };

  return [corp, article];
}

export interface FundJsonLdOptions {
  readonly canonicalUrl: string;
}

export function buildFundJsonLd(
  report: FundReportDoc,
  options: FundJsonLdOptions,
): [WithContext<FinancialProduct>, WithContext<Article>] {
  const product: WithContext<FinancialProduct> = {
    "@context": "https://schema.org",
    "@type": "FinancialProduct",
    name: report.name,
    category: report.category,
    url: options.canonicalUrl,
    provider: {
      "@type": "Organization",
      // AMC / fund house. The report DTO exposes the manager + category; the
      // explicit AMC name lives on the Phase-2 FundDto (amcCode). TODO Phase 2:
      // pass through a human-readable fund-house name when available.
      name: report.meta.managerName
        ? `${report.category} fund managed by ${report.meta.managerName}`
        : report.category,
    },
  };

  const article: WithContext<Article> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${report.name} — FinSight Fund Score & Analysis`,
    description: summaryOf(
      report.narrative?.paragraph,
      `Deterministic FinSight Fund Score and plain-English analysis for ${report.name}.`,
    ),
    datePublished: report.asOf,
    dateModified: report.asOf,
    author: PUBLISHER,
    publisher: PUBLISHER,
    mainEntityOfPage: options.canonicalUrl,
    about: { "@type": "FinancialProduct", name: report.name },
  };

  return [product, article];
}

export interface BreadcrumbInput {
  readonly level2: { readonly name: string; readonly url: string };
  readonly leaf: { readonly name: string; readonly url: string };
}

export function buildBreadcrumbJsonLd(
  input: BreadcrumbInput,
): WithContext<BreadcrumbList> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE },
      {
        "@type": "ListItem",
        position: 2,
        name: input.level2.name,
        item: input.level2.url,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: input.leaf.name,
        item: input.leaf.url,
      },
    ],
  };
}
