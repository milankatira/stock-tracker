import { Injectable, Logger } from "@nestjs/common";
import { Types } from "mongoose";
import type { OhlcCandle, Timeframe } from "@finsight/shared";
import { InstrumentsRepository } from "../modules/market-data/instruments/instruments.repository";
import { PriceHistoryRepository } from "../modules/market-data/price-history/price-history.repository";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const TIMEFRAME_DAYS: Readonly<Record<Timeframe, number>> = {
  "1D": 1,
  "1W": 7,
  "1M": 30,
  "6M": 183,
  "1Y": 365,
  "5Y": 365 * 5,
  MAX: 365 * 25,
};

/**
 * Read-only adapter over the Plan 02-03 price-history time-series
 * collection. Slices the requested timeframe relative to "now" and
 * returns `OhlcCandle[]` ready for the web's TradingView lightweight
 * chart.
 *
 * No downsampling in v1 — the daily granularity from Plan 02-03 is
 * already chart-friendly; phase 4 can revisit if the MAX timeframe
 * outgrows the wire budget.
 */
@Injectable()
export class PricesService {
  private readonly logger = new Logger(PricesService.name);

  constructor(
    private readonly instruments: InstrumentsRepository,
    private readonly priceHistory: PriceHistoryRepository,
  ) {}

  async getCandles(
    ticker: string,
    timeframe: Timeframe,
  ): Promise<readonly OhlcCandle[]> {
    const instrument = await this.instruments.findByNseSymbol(ticker);
    if (!instrument) return [];
    const since = this.windowStart(timeframe);
    const bars = await this.priceHistory.findByInstrument(
      instrument._id.toString() as unknown as string,
    );
    return bars
      .filter((bar) => bar.ts.getTime() >= since)
      .map((bar) => ({
        time: Math.floor(bar.ts.getTime() / 1000),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      }));
  }

  private windowStart(timeframe: Timeframe): number {
    return Date.now() - TIMEFRAME_DAYS[timeframe] * ONE_DAY_MS;
  }

  /** Helper used by the controller spec to assert ObjectId validation isn't required. */
  static isValidObjectId(value: string): boolean {
    return Types.ObjectId.isValid(value);
  }
}
