/**
 * Canonical URL builders for the public SEO pages (SEO-03).
 *
 * Dual-listing rule: when a stock trades on both NSE and BSE, the canonical
 * URL always uses the NSE symbol. NSE is the more liquid, more searched venue
 * for Indian retail; consolidating link equity on one URL avoids duplicate-
 * content dilution across `/stock/RELIANCE` (NSE) and `/stock/500325` (BSE).
 *
 * The exchange / nseSymbol metadata lives on the Phase-2 `InstrumentDto`
 * (`primaryExchange`, `nseSymbol`, `bseCode`), NOT on the report doc — the
 * caller resolves it from the instrument master and passes it in here.
 */
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://finsight.ai";

export interface CanonicalStockInput {
  /** The symbol/code from the route param (may be an NSE symbol or BSE code). */
  readonly symbol: string;
  readonly exchange: "NSE" | "BSE";
  /** Present only for BSE-listed routes that also have an NSE listing. */
  readonly nseSymbol?: string;
}

export function buildCanonicalStockUrl(input: CanonicalStockInput): string {
  // Dual-listed: a BSE route param with a known NSE symbol canonicalises to NSE.
  if (input.exchange === "BSE" && input.nseSymbol) {
    return `${SITE}/stock/${input.nseSymbol}`;
  }
  return `${SITE}/stock/${input.symbol}`;
}

export interface CanonicalFundInput {
  readonly schemeCode: string;
}

export function buildCanonicalFundUrl(input: CanonicalFundInput): string {
  return `${SITE}/fund/${input.schemeCode}`;
}
