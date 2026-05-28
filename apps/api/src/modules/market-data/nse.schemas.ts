import { z } from "zod";

/**
 * Boundary schemas for `stock-nse-india`. The SDK's TypeScript types are
 * permissive (everything is `string` or `number` with no constraints), so
 * we re-validate at the adapter boundary — protecting downstream code
 * from upstream shape drift the same way as the Yahoo path.
 */

export const nseEquityDetailsShape = z
  .object({
    info: z
      .object({
        symbol: z.string().min(1),
        companyName: z.string().min(1),
      })
      .passthrough(),
    priceInfo: z
      .object({
        lastPrice: z.number().finite(),
        change: z.number(),
        pChange: z.number(),
      })
      .passthrough(),
    metadata: z
      .object({
        symbol: z.string().min(1),
        lastUpdateTime: z.string().min(1),
        isin: z.string().min(1).optional(),
        listingDate: z.string().optional(),
        industry: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const nseCorporateActionShape = z.object({
  symbol: z.string().min(1),
  exdate: z.string().min(1),
  purpose: z.string().min(1),
});

export const nseCorporateInfoShape = z
  .object({
    corporate_actions: z
      .object({
        data: z.array(nseCorporateActionShape),
      })
      .passthrough(),
  })
  .passthrough();

export type NseEquityDetailsRaw = z.infer<typeof nseEquityDetailsShape>;
export type NseCorporateActionRaw = z.infer<typeof nseCorporateActionShape>;
export type NseCorporateInfoRaw = z.infer<typeof nseCorporateInfoShape>;

export type CorporateActionType = "SPLIT" | "BONUS" | "DIVIDEND" | "UNKNOWN";

/**
 * Pure classifier — exported alongside the schemas so the adjustment
 * service (Plan 02-03) can reuse the same heuristics without crossing
 * the adapter boundary.
 *
 * NSE corporate-action `purpose` strings are free-text written by
 * registrar staff; the rules below cover the high-value cases seen in
 * the most recent two years of large-cap actions. Anything else falls
 * through to UNKNOWN — the adjustment service must opt in explicitly.
 */
export function parseCorporateActionType(purpose: string): CorporateActionType {
  const text = purpose.toLowerCase();
  if (/(face\s*value|sub[-\s]?division).*split|stock\s+split|split\b/.test(text)) {
    return "SPLIT";
  }
  if (/bonus/.test(text)) return "BONUS";
  if (/dividend/.test(text)) return "DIVIDEND";
  return "UNKNOWN";
}

/**
 * Extract the integer split ratio (`"1:5"`) from a typical NSE `purpose`
 * string. Returns the original text when no ratio is detectable so the
 * adjustment service can log + skip without crashing.
 */
export function extractSplitRatio(purpose: string): string | undefined {
  const colonMatch = purpose.match(/(\d+)\s*[:∶/]\s*(\d+)/);
  if (colonMatch) return `${colonMatch[1]}:${colonMatch[2]}`;
  const rsMatch = purpose.match(/rs\.?\s*(\d+)\s*to\s*rs\.?\s*(\d+)/i);
  if (rsMatch) return `${rsMatch[2]}:${rsMatch[1]}`;
  return undefined;
}

/**
 * Extract the per-share dividend value (`"Interim Dividend - Rs. 8 Per Share"`).
 */
export function extractDividendValue(purpose: string): number | undefined {
  const rsMatch = purpose.match(/rs\.?\s*([\d.]+)/i);
  if (rsMatch) {
    const value = Number(rsMatch[1]);
    return Number.isFinite(value) ? value : undefined;
  }
  return undefined;
}
