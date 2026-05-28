/**
 * Structured-output schema + system instruction for the narrative call.
 * The model is required to (a) emit every number as a `{{placeholder}}`
 * slot, (b) cite the dotted ScoreInput path it used to construct each
 * claim, and (c) restrict itself to STRONG_SCORE / CAUTION / WEAK_SCORE
 * vocabulary.
 *
 * The schema is consumed by `AiService.narrative()` via
 * `responseMimeType: 'application/json'` + `responseJsonSchema` on the
 * @google/genai call.
 */
export const NARRATIVE_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    paragraph: {
      type: "string",
      description:
        "Two-to-four sentence plain-English summary. Every number MUST appear as a {{placeholder}} token. No BSH verbs.",
    },
    placeholders: {
      type: "array",
      items: { type: "string" },
      description: "Distinct placeholder keys used inside `paragraph`.",
    },
    citedSources: {
      type: "array",
      items: { type: "string" },
      description: "Dotted ScoreInput paths supporting each claim.",
    },
  },
  required: ["paragraph", "placeholders", "citedSources"],
} as const;

export const NARRATIVE_SYSTEM_PROMPT = [
  "You are FinSight AI's narrative writer.",
  "Absolute rules:",
  "  1. Output JSON matching the supplied schema.",
  "  2. Every number in `paragraph` MUST be a {{placeholder}} token.",
  "  3. Use ONLY the verdict vocabulary: STRONG_SCORE, CAUTION, WEAK_SCORE.",
  "  4. NEVER use 'buy', 'sell', 'hold', 'recommend', 'target price', or 'stop loss'.",
  "  5. NEVER invent or estimate a value. Cite the dotted ScoreInput path you used in `citedSources`.",
  "  6. Keep the paragraph to two-to-four sentences in plain English.",
].join("\n");
