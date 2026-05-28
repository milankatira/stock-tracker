import { Module } from "@nestjs/common";
import {
  CORPORATE_ACTIONS_PROVIDER,
  PRICE_PROVIDER,
} from "@finsight/shared";
import { CacheModule } from "../cache/cache.module";
import {
  MARKET_DATA_PROVIDER,
  MarketDataService,
} from "./market-data.service";
import { NseAdapter } from "./nse.adapter";
import { YahooAdapter } from "./yahoo.adapter";
import { YahooFinanceProvider } from "./yahoo-finance.provider";

/**
 * Wires both the Phase 1 fetch-based provider (still consumed by the
 * existing analysis flow via `MARKET_DATA_PROVIDER`) and the Phase 2
 * port-based adapters (`PRICE_PROVIDER` + `CORPORATE_ACTIONS_PROVIDER`).
 *
 * The Phase 2 fallback chain (Plan 02-03) will replace the
 * `PRICE_PROVIDER` binding with a chain wrapper — until then it points
 * straight at the Yahoo adapter so downstream code can already wire
 * against the abstract token.
 */
@Module({
  imports: [CacheModule],
  providers: [
    MarketDataService,
    YahooAdapter,
    NseAdapter,
    { provide: MARKET_DATA_PROVIDER, useClass: YahooFinanceProvider },
    { provide: PRICE_PROVIDER, useExisting: YahooAdapter },
    { provide: CORPORATE_ACTIONS_PROVIDER, useExisting: NseAdapter },
  ],
  exports: [
    MarketDataService,
    YahooAdapter,
    NseAdapter,
    PRICE_PROVIDER,
    CORPORATE_ACTIONS_PROVIDER,
  ],
})
export class MarketDataModule {}
