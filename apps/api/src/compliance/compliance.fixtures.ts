/**
 * Fixture pack consumed by the sanitiser + interceptor regression suites.
 * Categories per 04-RESEARCH.md Pitfall 3:
 *  - FORBIDDEN_FIXTURES — MUST trip at least one rule.
 *  - NEUTRAL_FIXTURES   — MUST NOT trip any rule (false-positive guard).
 *  - EVASION_FIXTURES   — known v1 gaps; sampled regression markers.
 */

export const FORBIDDEN_FIXTURES: ReadonlyArray<string> = [
  "Investors should buy this stock soon.",
  "Strong buy signal on this counter.",
  "We recommend holding the position for a year.",
  "Target price of Rs. 3,200 over 12 months.",
  "Place a stop loss at Rs. 1,450.",
  "You should buy on every dip.",
  "Sell the stock at the next high.",
  "Our recommendation is to accumulate.",
  "BUY on weakness, SELL into strength.",
  "₹2,800 target with 18% upside expected.",
];

export const NEUTRAL_FIXTURES: ReadonlyArray<string> = [
  "The Strong Score reflects healthy fundamentals across all pillars.",
  "The Caution verdict signals elevated short-term volatility.",
  "The Weak Score is driven by rising debt and falling profit margins.",
  "Operating margins expanded to 17% in the trailing twelve months.",
  "Promoter holding remained stable through the period.",
  "Quartile-stability analysis suggests consistent category performance.",
];

export const EVASION_FIXTURES: ReadonlyArray<string> = [
  "The data suggests action might be favourable.",
  "Investors may want to consider positioning here.",
  "The setup appears constructive for entry.",
];
