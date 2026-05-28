import { z } from "zod";

/**
 * Boundary schemas for the yahoo-finance2 SDK.
 *
 * We intentionally `parse()` (not `safeParse()`) inside the adapter — a
 * ZodError is the contract we want for malformed upstream data. The adapter
 * catches it and emits a `{ status: 'err', reason: 'validation' }` envelope.
 */

export const yahooQuoteShape = z
  .object({
    symbol: z.string().min(1),
    regularMarketPrice: z.number().finite(),
    /** SDK returns `Date` already; tolerate a raw epoch-seconds number too. */
    regularMarketTime: z
      .union([z.date(), z.number()])
      .transform((value) =>
        value instanceof Date ? value : new Date(Number(value) * 1000),
      ),
    currency: z.literal("INR"),
  })
  .passthrough();

export const yahooHistoryBarShape = z.object({
  date: z.coerce.date(),
  open: z.number().finite(),
  high: z.number().finite(),
  low: z.number().finite(),
  close: z.number().finite(),
  /** `adjClose` may be omitted by older SDK versions — keep required so
   *  the adapter rejects unadjusted history rather than silently mislabel.
   */
  adjClose: z.number().finite(),
  volume: z.number().int().nonnegative(),
});

export const yahooHistoryShape = z.array(yahooHistoryBarShape);

const yahooRawField = z
  .object({ raw: z.number().finite() })
  .transform((value) => value.raw)
  .optional();

export const yahooQuoteSummaryShape = z
  .object({
    price: z
      .object({
        marketCap: yahooRawField,
      })
      .passthrough()
      .optional(),
    summaryDetail: z
      .object({
        trailingPE: yahooRawField,
        priceToBook: yahooRawField,
        beta: yahooRawField,
      })
      .passthrough()
      .optional(),
    financialData: z
      .object({
        returnOnEquity: yahooRawField,
        debtToEquity: yahooRawField,
      })
      .passthrough()
      .optional(),
    defaultKeyStatistics: z
      .object({
        sharesOutstanding: yahooRawField,
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type YahooQuoteRaw = z.infer<typeof yahooQuoteShape>;
export type YahooHistoryBar = z.infer<typeof yahooHistoryBarShape>;
export type YahooQuoteSummary = z.infer<typeof yahooQuoteSummaryShape>;
