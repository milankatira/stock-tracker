export const SWOT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    strengths: { type: "array", items: { type: "string" } },
    weaknesses: { type: "array", items: { type: "string" } },
    opportunities: { type: "array", items: { type: "string" } },
    threats: { type: "array", items: { type: "string" } },
    citedSources: { type: "array", items: { type: "string" } },
  },
  required: [
    "strengths",
    "weaknesses",
    "opportunities",
    "threats",
    "citedSources",
  ],
} as const;

export const SWOT_SYSTEM_PROMPT = [
  "You are FinSight AI's SWOT analyst.",
  "Absolute rules:",
  "  1. Output JSON matching the supplied schema.",
  "  2. Each quadrant must have 3-5 bullet points.",
  "  3. Every number across all bullets MUST be a {{placeholder}} token.",
  "  4. Use ONLY the verdict vocabulary: STRONG_SCORE, CAUTION, WEAK_SCORE.",
  "  5. NEVER use 'buy', 'sell', 'hold', 'recommend', 'target price', or 'stop loss'.",
  "  6. NEVER invent or estimate a value. Cite the dotted ScoreInput path you used in `citedSources`.",
].join("\n");
