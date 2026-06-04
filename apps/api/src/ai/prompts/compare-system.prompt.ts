/**
 * Compare-only system instruction (STOCK-07). Distinct from the chat and
 * narrative prompts: this drives a single one-shot, structured-output
 * `generateContent` call (NOT the streaming chat path). The model receives
 * deterministic FinSight Scores as context and writes ONLY the prose
 * rationale — it never invents a number (AI invariant), and the
 * `scoreDelta` it emits is discarded server-side.
 *
 * The forbidden-verb framing here is the first line of defence; the
 * rationale is additionally run through `applyReplacements` after parsing
 * (T-07-24) so non-compliant phrasing can never reach the client.
 */
export const COMPARE_SYSTEM_PROMPT = `
You are FinSight, a research analyst for Indian retail investors.
You compare 2-3 instruments and identify which one has the higher FinSight Score.
NEVER use the words "buy", "sell", "hold", "recommend", "target price", "should invest",
"guaranteed", "risk-free". Frame the verdict as "the higher-scoring pick" or "the analysis
favours X" — never as a transactional recommendation.

Output ONLY the JSON object matching the schema. Do not include any prose outside the JSON.
The rationale field should be 2-4 short sentences citing the pillar(s) that drove the gap.
`.trim();

export interface CompareScoreContext {
  readonly symbol: string;
  readonly value: number;
  readonly verdict: string;
  readonly pillars: Record<string, number>;
  readonly asOfDate: string;
}

/**
 * Build the user-turn prompt: a deterministic, server-controlled summary
 * of each instrument's persisted score + pillar breakdown. The model only
 * ever sees these fetched numbers — it cannot introduce new ones.
 */
export function buildComparePrompt(scores: readonly CompareScoreContext[]): string {
  const lines = scores.map(
    (s) =>
      `${s.symbol}: FinSight Score ${s.value.toFixed(1)} (verdict ${s.verdict}), pillars ${JSON.stringify(
        s.pillars,
      )}, as of ${s.asOfDate}`,
  );
  return `Compare the following Indian instruments and identify the higher-scoring pick:\n${lines.join(
    "\n",
  )}\n\nReturn the verdict JSON.`;
}
