import { Injectable } from "@nestjs/common";
import { RefusalCategory } from "./refusal.enum";

const MAX_MESSAGE_LEN = 2000;

/**
 * Ordered rule — FIRST match wins. Order matters: prompt-injection and
 * geographic scope are checked before buy/sell so "Should I buy AAPL?"
 * resolves to OUT_OF_SCOPE_GEO (the geographic violation), not BUYSELL.
 */
const RULES: ReadonlyArray<{ readonly category: RefusalCategory; readonly re: RegExp }> = [
  { category: RefusalCategory.PROMPT_INJECTION_DETECTED, re: /ignore\s+(?:previous|prior|above)/i },
  { category: RefusalCategory.PROMPT_INJECTION_DETECTED, re: /pretend\s+you\s+are|act\s+as\s+if/i },
  { category: RefusalCategory.PROMPT_INJECTION_DETECTED, re: /\bi\s+am\s+sebi\b/i },
  { category: RefusalCategory.PROMPT_INJECTION_DETECTED, re: /<\/?system>|<\|im_(?:start|end)\|>/i },
  { category: RefusalCategory.PROMPT_INJECTION_DETECTED, re: /[A-Za-z0-9+/=]{100,}/ },
  { category: RefusalCategory.OUT_OF_SCOPE_GEO, re: /\b(?:NYSE|NASDAQ|AAPL|MSFT|TSLA|GOOG|AMZN|NVDA)\b/ },
  { category: RefusalCategory.OUT_OF_SCOPE_GEO, re: /\bus\s+stocks?\b/i },
  { category: RefusalCategory.OUT_OF_SCOPE_ASSET, re: /\b(?:bitcoin|btc|crypto|ethereum|eth|forex|commodit(?:y|ies))\b/i },
  { category: RefusalCategory.OUT_OF_SCOPE_ASSET, re: /\b(?:F&O|futures|options)\b/i },
  { category: RefusalCategory.NON_COMPLIANT_INSIDER, re: /\b(?:insider|inside\s+info(?:rmation)?|tips?)\b/i },
  { category: RefusalCategory.NON_COMPLIANT_GUARANTEE, re: /\b(?:guaranteed|definitely|risk[\s-]?free|sure[\s-]?shot)\b/i },
  { category: RefusalCategory.NON_COMPLIANT_TAX_EVASION, re: /\b(?:avoid\s+(?:paying\s+)?tax|tax\s+evasion|black\s+money)\b/i },
  { category: RefusalCategory.NON_COMPLIANT_BUYSELL, re: /\bshould\s+i\s+(?:buy|sell|invest|exit)\b/i },
];

/**
 * Pre-stream refusal classifier (CHAT-04). Rejects out-of-scope and
 * non-compliant queries WITHOUT spending a Gemini call. Returns the first
 * matching `RefusalCategory`, or `null` for a clean Indian-equity query.
 */
@Injectable()
export class RefusalDetector {
  classify(userMessage: string): RefusalCategory | null {
    if (typeof userMessage !== "string" || userMessage.length > MAX_MESSAGE_LEN) {
      return RefusalCategory.PROMPT_INJECTION_DETECTED;
    }
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      if (rule.re.test(userMessage)) return rule.category;
    }
    return null;
  }
}
