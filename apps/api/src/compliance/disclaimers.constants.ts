// TODO(legal-signoff): final wording pending SEBI/compliance counsel review
// (open question #4 in 04-RESEARCH.md). The constants below are interim copy
// that satisfies the COMP-03 contract while we wait for legal sign-off.

/** Default analysis-not-advice disclaimer attached to every AI-emitted payload. */
export const ANALYSIS_DISCLAIMER =
  "This is analysis, not investment advice. FinSight AI is not a SEBI-registered Research Analyst. " +
  "Do not treat any output as a recommendation to act on any security.";

/** Past-performance disclaimer attached when the payload references historical returns. */
export const PAST_PERF_DISCLAIMER =
  "Past performance does not guarantee future results. Historical returns may not repeat.";
