/**
 * Compliance disclaimer block rendered on every public SEO page (SEO-04).
 *
 * Pure Server Component (no `'use client'`) so the text is always present in
 * server-rendered HTML — crawlers and no-JS clients see it. Prefers the
 * report's own Phase-4 disclaimer strings when supplied; otherwise falls back
 * to the canonical constants (used by the long-tail stub page, which has no
 * report DTO).
 */
import type { ReactElement } from "react";
import {
  ANALYSIS_DISCLAIMER,
  PAST_PERF_DISCLAIMER,
} from "@/lib/seo/disclaimers";

interface DisclaimersProps {
  readonly context: "report" | "fund-report";
  /** Optional report-supplied copy (Phase 4 compliance contract). */
  readonly analysis?: string;
  readonly pastPerformance?: string;
}

export function Disclaimers({
  analysis,
  pastPerformance,
}: DisclaimersProps): ReactElement {
  const analysisText = analysis ?? ANALYSIS_DISCLAIMER;
  const pastPerfText = pastPerformance ?? PAST_PERF_DISCLAIMER;
  return (
    <aside
      aria-label="Compliance disclaimers"
      role="contentinfo"
      className="mt-12 border-t pt-6 text-sm text-muted-foreground"
    >
      <p className="mb-2">
        <strong>Disclaimer:</strong> {analysisText}
      </p>
      <p>{pastPerfText}</p>
    </aside>
  );
}
