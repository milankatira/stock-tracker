import { Injectable, Logger } from "@nestjs/common";
import Bottleneck from "bottleneck";
import pRetry from "p-retry";
import pTimeout from "p-timeout";
import yahooFinance from "yahoo-finance2";
import { z } from "zod";
import type {
  Fundamentals,
  OHLCVBar,
  PriceProvider,
  ProviderResult,
  Quote,
  QuoteSummaryModule,
} from "@finsight/shared";
import {
  yahooHistoryShape,
  yahooQuoteShape,
  yahooQuoteSummaryShape,
  type YahooHistoryBar,
  type YahooQuoteRaw,
  type YahooQuoteSummary,
} from "./yahoo.schemas";

const SOURCE = "yahoo-finance2";
const REQUEST_TIMEOUT_MS = 6_000;
const RETRY_OPTS = { retries: 2, minTimeout: 300, factor: 2, randomize: true };
const LIMITER_OPTS = { maxConcurrent: 4, minTime: 250 };

type YahooFinanceLike = {
  quote: (symbol: string) => Promise<unknown>;
  historical: (
    symbol: string,
    options: { period1: Date; period2: Date; interval: "1d" },
  ) => Promise<unknown>;
  quoteSummary: (
    symbol: string,
    options: { modules: readonly QuoteSummaryModule[] },
  ) => Promise<unknown>;
};

const yahoo = yahooFinance as unknown as YahooFinanceLike;

/**
 * Yahoo Finance primary price provider. Implements the `PriceProvider`
 * port from `@finsight/shared` so domain code (scoring, narrative,
 * reports) depends only on the abstract contract.
 *
 * Resilience pipeline per call:
 *   bottleneck (per-process pacing)
 *     → pRetry (transient failure recovery, jittered backoff)
 *       → pTimeout (hard upper bound)
 *
 * `parse()` (not `safeParse()`) is intentional at the boundary — a
 * malformed upstream payload becomes a typed `validation` Err, never a
 * silent type-cast.
 */
@Injectable()
export class YahooAdapter implements PriceProvider {
  private readonly logger = new Logger(YahooAdapter.name);
  private readonly limiter = new Bottleneck(LIMITER_OPTS);

  async getLatestQuote(yahooSymbol: string): Promise<ProviderResult<Quote>> {
    try {
      const raw = await this.invoke(() => yahoo.quote(yahooSymbol));
      const parsed: YahooQuoteRaw = yahooQuoteShape.parse(raw);
      const fetchedAt = new Date();
      return {
        status: "ok",
        source: SOURCE,
        fetchedAt,
        data: {
          price: parsed.regularMarketPrice,
          asOf: parsed.regularMarketTime,
          currency: "INR",
        },
      };
    } catch (err) {
      return this.handleError(err, yahooSymbol, "getLatestQuote");
    }
  }

  async getDailyHistory(
    yahooSymbol: string,
    from: Date,
    to: Date,
  ): Promise<ProviderResult<OHLCVBar[]>> {
    try {
      const raw = await this.invoke(() =>
        yahoo.historical(yahooSymbol, {
          period1: from,
          period2: to,
          interval: "1d",
        }),
      );
      const parsed: YahooHistoryBar[] = yahooHistoryShape.parse(raw);
      return {
        status: "ok",
        source: SOURCE,
        fetchedAt: new Date(),
        data: parsed.map((bar) => ({
          ts: bar.date,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.adjClose,
          rawClose: bar.close,
          volume: bar.volume,
        })),
      };
    } catch (err) {
      return this.handleError(err, yahooSymbol, "getDailyHistory");
    }
  }

  async getFundamentals(
    yahooSymbol: string,
    modules: readonly QuoteSummaryModule[],
  ): Promise<ProviderResult<Fundamentals>> {
    try {
      const raw = await this.invoke(() =>
        yahoo.quoteSummary(yahooSymbol, { modules }),
      );
      const parsed: YahooQuoteSummary = yahooQuoteSummaryShape.parse(raw);
      return {
        status: "ok",
        source: SOURCE,
        fetchedAt: new Date(),
        data: this.flattenFundamentals(parsed),
      };
    } catch (err) {
      return this.handleError(err, yahooSymbol, "getFundamentals");
    }
  }

  private flattenFundamentals(parsed: YahooQuoteSummary): Fundamentals {
    return {
      marketCap: parsed.price?.marketCap,
      trailingPE: parsed.summaryDetail?.trailingPE,
      priceToBook: parsed.summaryDetail?.priceToBook,
      beta: parsed.summaryDetail?.beta,
      returnOnEquity: parsed.financialData?.returnOnEquity,
      debtToEquity: parsed.financialData?.debtToEquity,
      sharesOutstanding: parsed.defaultKeyStatistics?.sharesOutstanding,
      raw: parsed,
    };
  }

  private async invoke<T>(fn: () => Promise<T>): Promise<T> {
    return this.limiter.schedule(() =>
      pRetry(() => pTimeout(fn(), { milliseconds: REQUEST_TIMEOUT_MS }), RETRY_OPTS),
    );
  }

  private handleError(
    err: unknown,
    yahooSymbol: string,
    operation: string,
  ): ProviderResult<never> {
    if (err instanceof z.ZodError) {
      this.logger.error(
        {
          provider: SOURCE,
          yahooSymbol,
          operation,
          issues: err.issues,
        },
        "yahoo_schema_validation_failed",
      );
      return {
        status: "err",
        reason: "validation",
        message: err.message,
        source: SOURCE,
      };
    }
    // Non-validation errors (timeout, network, upstream 5xx, etc.) are
    // rethrown so the Plan 02-03 circuit breaker counts the failure.
    throw err;
  }
}
