/**
 * Refusal taxonomy for Ask FinSight (CHAT-04). Typed enum mirroring the
 * compliance verdict-enum pattern so the category is a stable contract
 * shared across the API stream events, the persisted chat history
 * (Plan 03), and the frontend refusal banners.
 */
export enum RefusalCategory {
  /** US/foreign tickers, exchanges — FinSight covers Indian equities/funds only. */
  OUT_OF_SCOPE_GEO = "OUT_OF_SCOPE_GEO",
  /** Crypto, F&O, forex, commodities — out of asset scope. */
  OUT_OF_SCOPE_ASSET = "OUT_OF_SCOPE_ASSET",
  /** Insider information / tips. */
  NON_COMPLIANT_INSIDER = "NON_COMPLIANT_INSIDER",
  /** Guaranteed/risk-free/sure-shot return claims. */
  NON_COMPLIANT_GUARANTEE = "NON_COMPLIANT_GUARANTEE",
  /** Explicit buy/sell/invest action requests. */
  NON_COMPLIANT_BUYSELL = "NON_COMPLIANT_BUYSELL",
  /** Tax-evasion / black-money queries. */
  NON_COMPLIANT_TAX_EVASION = "NON_COMPLIANT_TAX_EVASION",
  /** Prompt-injection / jailbreak attempts. */
  PROMPT_INJECTION_DETECTED = "PROMPT_INJECTION_DETECTED",
  /** Gemini exceeded the N=5 tool-turn cap. */
  TOOL_LIMIT_EXCEEDED = "TOOL_LIMIT_EXCEEDED",
  /** Answer dropped a required data citation (Plan 03 validator). */
  CITATION_MISSING = "CITATION_MISSING",
  /** Throttler / upstream rate limit. */
  RATE_LIMITED = "RATE_LIMITED",
}
