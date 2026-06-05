/**
 * Single source of truth for the compliance disclaimer copy rendered on every
 * public SEO page (real reports AND long-tail stubs).
 *
 * Compliance (NON-NEGOTIABLE per PROJECT.md): all output is framed as
 * "analysis," never "advice," until SEBI RA registration. Every report screen
 * carries the analysis-not-advice disclaimer; every returns view carries the
 * past-performance disclaimer.
 *
 * The real `StockReportDoc` / `FundReportDoc` carry their own
 * `disclaimers.analysis` / `disclaimers.pastPerformance` strings (Phase 4
 * compliance contract). These constants are the fallback used by the stub
 * page (which has no DTO) and guarantee the disclaimer text is present in
 * server-rendered HTML even when no report exists yet.
 */
export const ANALYSIS_DISCLAIMER =
  "Analysis, not investment advice. FinSight AI is not a SEBI-registered Research Analyst or Investment Adviser.";

export const PAST_PERF_DISCLAIMER =
  "Past performance is not indicative of future returns. Mutual fund investments are subject to market risks. Read all scheme-related documents carefully.";
