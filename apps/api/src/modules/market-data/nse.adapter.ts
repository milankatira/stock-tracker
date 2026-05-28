import { Injectable, Logger, Optional } from "@nestjs/common";
import Bottleneck from "bottleneck";
import pTimeout from "p-timeout";
import { NseIndia } from "stock-nse-india";
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
  extractDividendValue,
  extractSplitRatio,
  nseCorporateInfoShape,
  nseEquityDetailsShape,
  parseCorporateActionType,
  type CorporateActionType,
  type NseCorporateActionRaw,
  type NseEquityDetailsRaw,
} from "./nse.schemas";

const SOURCE = "stock-nse-india";
const REQUEST_TIMEOUT_MS = 10_000;
const LIMITER_OPTS = { maxConcurrent: 2, minTime: 500 };

export interface CorporateAction {
  readonly ticker: string;
  readonly exDate: Date;
  readonly type: CorporateActionType;
  readonly ratio?: string;
  readonly value?: number;
  readonly rawPurpose: string;
}

interface NseClientLike {
  getEquityDetails(symbol: string): Promise<unknown>;
  getEquityCorporateInfo(symbol: string): Promise<unknown>;
}

/**
 * NSE supplement adapter. Implements `PriceProvider` so it can sit in
 * the same DI shape as Yahoo, but history + fundamentals are
 * deliberately not-found because the upstream NSE endpoints are
 * unreliable per RESEARCH.md (Pitfall 5). The real value here is the
 * corporate-actions feed used by the Plan 02-03 split/bonus adjuster to
 * cross-check Yahoo's `adjClose`.
 */
@Injectable()
export class NseAdapter implements PriceProvider {
  private readonly logger = new Logger(NseAdapter.name);
  private readonly limiter = new Bottleneck(LIMITER_OPTS);
  private readonly client: NseClientLike;

  constructor(@Optional() client?: NseClientLike) {
    this.client = client ?? (new NseIndia() as unknown as NseClientLike);
  }

  async getLatestQuote(yahooSymbol: string): Promise<ProviderResult<Quote>> {
    const nseSymbol = this.toNseSymbol(yahooSymbol);
    try {
      const raw = await this.invoke(() => this.client.getEquityDetails(nseSymbol));
      const parsed: NseEquityDetailsRaw = nseEquityDetailsShape.parse(raw);
      const asOfText = parsed.metadata?.lastUpdateTime;
      const asOf = asOfText ? this.parseNseTimestamp(asOfText) : new Date();
      return {
        status: "ok",
        source: SOURCE,
        fetchedAt: new Date(),
        data: {
          price: parsed.priceInfo.lastPrice,
          asOf,
          currency: "INR",
        },
      };
    } catch (err) {
      return this.handleError(err, nseSymbol, "getLatestQuote");
    }
  }

  // Intentionally not supported — NSE wrapper history is unreliable per
  // RESEARCH.md Pitfall 5. Returning typed `not-found` keeps the chain
  // happy and never persists a fake bar.
  async getDailyHistory(): Promise<ProviderResult<OHLCVBar[]>> {
    return {
      status: "err",
      reason: "not-found",
      message: "history not supported by NSE supplement",
      source: SOURCE,
    };
  }

  async getFundamentals(
    _yahooSymbol: string,
    _modules: readonly QuoteSummaryModule[],
  ): Promise<ProviderResult<Fundamentals>> {
    return {
      status: "err",
      reason: "not-found",
      message: "fundamentals not supported by NSE supplement",
      source: SOURCE,
    };
  }

  /**
   * Corporate actions feed — the real reason NSE exists alongside Yahoo.
   * Returns events newest-first so the adjustment service can walk the
   * timeline backward when cross-checking `adjClose`.
   */
  async getCorporateActions(
    yahooSymbol: string,
    from: Date,
    to: Date,
  ): Promise<ProviderResult<CorporateAction[]>> {
    const nseSymbol = this.toNseSymbol(yahooSymbol);
    try {
      const raw = await this.invoke(() =>
        this.client.getEquityCorporateInfo(nseSymbol),
      );
      const parsed = nseCorporateInfoShape.parse(raw);
      const items = parsed.corporate_actions.data
        .map((event) => this.toCorporateAction(event))
        .filter((event) => event.exDate >= from && event.exDate <= to)
        .sort((a, b) => b.exDate.getTime() - a.exDate.getTime());
      return {
        status: "ok",
        source: SOURCE,
        fetchedAt: new Date(),
        data: items,
      };
    } catch (err) {
      return this.handleError(err, nseSymbol, "getCorporateActions");
    }
  }

  private toCorporateAction(event: NseCorporateActionRaw): CorporateAction {
    const type = parseCorporateActionType(event.purpose);
    return {
      ticker: event.symbol,
      exDate: this.parseNseDate(event.exdate),
      type,
      ratio: type === "SPLIT" ? extractSplitRatio(event.purpose) : undefined,
      value: type === "DIVIDEND" ? extractDividendValue(event.purpose) : undefined,
      rawPurpose: event.purpose,
    };
  }

  private toNseSymbol(yahooSymbol: string): string {
    return yahooSymbol.replace(/\.NS$/i, "").replace(/\.BO$/i, "");
  }

  private parseNseDate(value: string): Date {
    // NSE typically formats as "27-May-2026" or ISO-ish strings.
    const direct = new Date(value);
    if (!Number.isNaN(direct.getTime())) return direct;
    const dashMatch = value.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
    if (dashMatch) {
      const [, day, monthAbbr, year] = dashMatch;
      const months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      const month = months.findIndex(
        (m) => m.toLowerCase() === monthAbbr.toLowerCase(),
      );
      if (month >= 0) {
        return new Date(Date.UTC(Number(year), month, Number(day)));
      }
    }
    return new Date(NaN);
  }

  private parseNseTimestamp(value: string): Date {
    const parsed = this.parseNseDate(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    return new Date();
  }

  private async invoke<T>(fn: () => Promise<T>): Promise<T> {
    return this.limiter.schedule(() =>
      pTimeout(fn(), { milliseconds: REQUEST_TIMEOUT_MS }),
    );
  }

  private handleError(
    err: unknown,
    nseSymbol: string,
    operation: string,
  ): ProviderResult<never> {
    if (err instanceof z.ZodError) {
      this.logger.error(
        { provider: SOURCE, nseSymbol, operation, issues: err.issues },
        "nse_schema_validation_failed",
      );
      return {
        status: "err",
        reason: "validation",
        message: err.message,
        source: SOURCE,
      };
    }
    throw err;
  }
}
