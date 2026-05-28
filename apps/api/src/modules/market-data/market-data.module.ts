import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import {
  CORPORATE_ACTIONS_PROVIDER,
  FUND_PROVIDER,
  NEWS_PROVIDER,
  PRICE_PROVIDER,
} from "@finsight/shared";
import { AmfiAdapter } from "./amfi.adapter";
import { CacheModule } from "../cache/cache.module";
import {
  MARKET_DATA_PROVIDER,
  MarketDataService,
} from "./market-data.service";
import { MfapiAdapter } from "./mfapi.adapter";
import { NewsDataIoAdapter } from "./newsdata-io.adapter";
import { NseAdapter } from "./nse.adapter";
import { RssNewsAdapter } from "./rss-news.adapter";
import { YahooAdapter } from "./yahoo.adapter";
import { YahooFinanceProvider } from "./yahoo-finance.provider";

/**
 * Wires both the Phase 1 fetch-based provider (still consumed by the
 * existing analysis flow via `MARKET_DATA_PROVIDER`) and the Phase 2
 * port-based adapters.
 *
 * `PRICE_PROVIDER` → YahooAdapter (Plan 02-03 chain replaces).
 * `CORPORATE_ACTIONS_PROVIDER` → NseAdapter.
 * `FUND_PROVIDER` → MfapiAdapter primary, with AmfiAdapter available as a
 *   secondary (Plan 02-03 chain wires the fallback).
 * `NEWS_PROVIDER` → RssNewsAdapter primary; NewsDataIoAdapter graceful
 *   no-op when the API key is not configured.
 */
@Module({
  imports: [CacheModule, ConfigModule],
  providers: [
    MarketDataService,
    YahooAdapter,
    NseAdapter,
    MfapiAdapter,
    AmfiAdapter,
    RssNewsAdapter,
    NewsDataIoAdapter,
    { provide: MARKET_DATA_PROVIDER, useClass: YahooFinanceProvider },
    { provide: PRICE_PROVIDER, useExisting: YahooAdapter },
    { provide: CORPORATE_ACTIONS_PROVIDER, useExisting: NseAdapter },
    { provide: FUND_PROVIDER, useExisting: MfapiAdapter },
    { provide: NEWS_PROVIDER, useExisting: RssNewsAdapter },
  ],
  exports: [
    MarketDataService,
    YahooAdapter,
    NseAdapter,
    MfapiAdapter,
    AmfiAdapter,
    RssNewsAdapter,
    NewsDataIoAdapter,
    PRICE_PROVIDER,
    CORPORATE_ACTIONS_PROVIDER,
    FUND_PROVIDER,
    NEWS_PROVIDER,
  ],
})
export class MarketDataModule {}
