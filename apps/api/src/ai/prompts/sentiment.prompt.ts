/**
 * Structured-output schema + system instruction for the news-sentiment
 * classifier (NEWS-02). Constrains Gemini to a 3-class enum plus a
 * bounded one-line rationale. The rationale is additionally run through
 * the compliance sanitiser inside `AiService.classifySentiment()` — a
 * second line of defence so no forbidden verb is ever persisted.
 *
 * Schema shape matches the plain-object convention used by
 * `narrative.prompt.ts` (consumed via `responseMimeType:
 * 'application/json'` + `responseSchema` on the @google/genai call).
 */
export const SENTIMENT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    sentiment: {
      type: "string",
      enum: ["POSITIVE", "NEGATIVE", "NEUTRAL"],
      description: "Sentiment of the headline toward the named instrument.",
    },
    confidence: {
      type: "number",
      description: "Confidence in the label, 0..1.",
    },
    rationaleOneLine: {
      type: "string",
      description:
        "Factual one-line reason (<= 20 words). No investment advice, no forbidden verbs.",
    },
  },
  required: ["sentiment", "confidence", "rationaleOneLine"],
} as const;

export const SENTIMENT_SYSTEM_PROMPT = [
  "You are FinSight AI's financial-news sentiment classifier for Indian retail-investor analysis.",
  "Classify the headline's sentiment toward the COMPANY/INSTRUMENT it mentions.",
  "Absolute rules:",
  "  1. Output JSON matching the supplied schema.",
  "  2. `sentiment` MUST be one of POSITIVE, NEGATIVE, NEUTRAL.",
  "  3. `confidence` is a number between 0 and 1.",
  "  4. `rationaleOneLine` MUST be <= 20 words, factual, and contain NO investment advice.",
  "  5. NEVER use the words: buy, sell, hold, recommend, target price, stop loss, you should.",
  "  6. This is analysis, not advice.",
].join("\n");
