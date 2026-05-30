import { RefusalCategory } from "./refusal.enum";

/**
 * Canonical user-facing refusal copy. SEBI-safe: every line frames
 * FinSight as analysis-only and never substitutes a recommendation.
 * The frontend renders these verbatim in a refusal banner (Plan 03).
 */
export const REFUSAL_TEMPLATES: Record<RefusalCategory, string> = {
  [RefusalCategory.OUT_OF_SCOPE_GEO]:
    "FinSight only covers Indian-listed stocks and mutual funds. I can't analyse US or foreign-market securities.",
  [RefusalCategory.OUT_OF_SCOPE_ASSET]:
    "FinSight covers Indian stocks and mutual funds only — not crypto, F&O, forex, or commodities.",
  [RefusalCategory.NON_COMPLIANT_INSIDER]:
    "I can't help with insider information or tips. FinSight provides analysis of publicly available data only.",
  [RefusalCategory.NON_COMPLIANT_GUARANTEE]:
    "No investment offers guaranteed or risk-free returns. I can share historical performance as analysis, never a promise.",
  [RefusalCategory.NON_COMPLIANT_BUYSELL]:
    "I provide analysis, not buy/sell advice. I can explain the FinSight Score and the data behind it so you can decide.",
  [RefusalCategory.NON_COMPLIANT_TAX_EVASION]:
    "I can't help with tax avoidance or evasion. Please consult a qualified tax professional.",
  [RefusalCategory.PROMPT_INJECTION_DETECTED]:
    "I can only help with analysis of Indian stocks and mutual funds. Please rephrase your question.",
  [RefusalCategory.TOOL_LIMIT_EXCEEDED]:
    "That question needed too many data look-ups to answer reliably. Try asking about one instrument at a time.",
  [RefusalCategory.CITATION_MISSING]:
    "I couldn't ground that answer in verified data, so I've held it back. Please try rephrasing.",
  [RefusalCategory.RATE_LIMITED]:
    "You're sending messages a little too fast. Please wait a moment and try again.",
};
