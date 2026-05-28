import { Injectable } from "@nestjs/common";
import { z } from "zod";
import type { MarketDataProvider, Quote } from "./market-data.service";

type QuoteFetcher = (url: string) => Promise<Response>;

const yahooQuoteSchema = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z.object({
            symbol: z.string().min(1),
            regularMarketPrice: z.number().finite(),
            currency: z.string().min(1),
            regularMarketTime: z.number().int().nonnegative(),
          }),
        }),
      )
      .min(1),
    error: z.unknown().nullable().optional(),
  }),
});

export async function getYahooQuote(
  symbol: string,
  fetcher: QuoteFetcher = fetch,
): Promise<Quote> {
  const response = await requestYahooQuote(symbol, fetcher);
  const body = await readQuoteJson(response);
  const parsed = yahooQuoteSchema.safeParse(body);

  if (!parsed.success) {
    throw new Error("YahooFinanceProvider: malformed quote response", {
      cause: parsed.error,
    });
  }

  const { meta } = parsed.data.chart.result[0];
  if (meta.currency !== "INR") {
    throw new Error("YahooFinanceProvider: expected INR quote currency");
  }

  return {
    symbol: meta.symbol,
    price: meta.regularMarketPrice,
    currency: "INR",
    asOf: new Date(meta.regularMarketTime * 1000).toISOString(),
    source: "yahoo-finance",
  };
}

@Injectable()
export class YahooFinanceProvider implements MarketDataProvider {
  getQuote(symbol: string): Promise<Quote> {
    return getYahooQuote(symbol);
  }
}

function yahooQuoteUrl(symbol: string): string {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?interval=1d&range=1d`;
}

async function requestYahooQuote(symbol: string, fetcher: QuoteFetcher): Promise<Response> {
  let response: Response;
  try {
    response = await fetcher(yahooQuoteUrl(symbol));
  } catch (error) {
    throw new Error("YahooFinanceProvider: quote request failed", { cause: error });
  }

  if (!response.ok) {
    throw new Error(
      `YahooFinanceProvider: quote request failed with status ${response.status}`,
    );
  }

  return response;
}

async function readQuoteJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new Error("YahooFinanceProvider: invalid quote response JSON", {
      cause: error,
    });
  }
}
