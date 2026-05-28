import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import {
  CORPORATE_ACTIONS_PROVIDER,
  FUND_PROVIDER,
  NEWS_PROVIDER,
  PRICE_PROVIDER,
} from "@finsight/shared";
import { AmfiAdapter } from "./amfi.adapter";
import { CacheModule } from "../cache/cache.module";
import { MarketHolidayService } from "./calendar/market-holiday.service";
import { FundChainService } from "./chains/fund-chain.service";
import { NewsChainService } from "./chains/news-chain.service";
import { PriceChainService } from "./chains/price-chain.service";
import { TickerTaggerService } from "./chains/ticker-tagger.service";
import { CircuitBreakerFactory } from "./circuit/breaker.factory";
import { DataVersionHashService } from "./instruments/data-version-hash.service";
import { Fund, FundSchema } from "./instruments/fund.schema";
import { FundsRepository } from "./instruments/funds.repository";
import {
  Instrument,
  InstrumentSchema,
} from "./instruments/instrument.schema";
import { InstrumentsRepository } from "./instruments/instruments.repository";
import { LookupService } from "./instruments/lookup.service";
import { AmfiSchemeMasterSeed } from "./instruments/seed/amfi-scheme-master.seed";
import { InstrumentMasterSeedRunner } from "./instruments/seed/instrument-master-seed.runner";
import { NseBhavcopySeed } from "./instruments/seed/nse-bhavcopy.seed";
import {
  MARKET_DATA_PROVIDER,
  MarketDataService,
} from "./market-data.service";
import { MfapiAdapter } from "./mfapi.adapter";
import { NewsDataIoAdapter } from "./newsdata-io.adapter";
import { NseAdapter } from "./nse.adapter";
import { AdjustmentService } from "./price-history/adjustment.service";
import {
  NavHistory,
  NavHistorySchema,
} from "./price-history/nav-history.schema";
import { NavHistoryRepository } from "./price-history/nav-history.repository";
import {
  PriceHistory,
  PriceHistorySchema,
} from "./price-history/price-history.schema";
import { PriceHistoryRepository } from "./price-history/price-history.repository";
import { RssNewsAdapter } from "./rss-news.adapter";
import { StaleCacheService } from "./stale-cache/stale-cache.service";
import { YahooAdapter } from "./yahoo.adapter";
import { YahooFinanceProvider } from "./yahoo-finance.provider";

/**
 * Plan 02-03 wires the full ingestion stack:
 *
 *  - Adapters from Plans 01 + 02 (Yahoo, NSE, MFAPI, AMFI, RSS, NewsData.io)
 *  - Instrument + Fund Mongo schemas + repos + lookup + monthly seed runner
 *  - Time-series price_history + nav_history collections + adjustment service
 *  - NSE holiday calendar service
 *  - opossum 9 breaker factory + Redis stale-cache
 *  - Three chain services replacing the scaffold PRICE_PROVIDER /
 *    FUND_PROVIDER / NEWS_PROVIDER bindings from the earlier plans
 *  - TickerTaggerService that joins news items to canonical instruments
 *
 * Domain code (Phase 3 scoring, Phase 4 reports) sees only the abstract
 * ports — the chain services are the only place that knows about the
 * concrete adapters.
 */
@Module({
  imports: [
    CacheModule,
    ConfigModule,
    MongooseModule.forFeature([
      { name: Instrument.name, schema: InstrumentSchema },
      { name: Fund.name, schema: FundSchema },
      { name: PriceHistory.name, schema: PriceHistorySchema },
      { name: NavHistory.name, schema: NavHistorySchema },
    ]),
  ],
  providers: [
    MarketDataService,

    // Adapters
    YahooAdapter,
    NseAdapter,
    MfapiAdapter,
    AmfiAdapter,
    RssNewsAdapter,
    NewsDataIoAdapter,

    // Instrument master
    InstrumentsRepository,
    FundsRepository,
    LookupService,
    DataVersionHashService,
    NseBhavcopySeed,
    AmfiSchemeMasterSeed,
    InstrumentMasterSeedRunner,

    // Time-series + adjustment
    PriceHistoryRepository,
    NavHistoryRepository,
    AdjustmentService,

    // Calendar / resilience
    MarketHolidayService,
    CircuitBreakerFactory,
    StaleCacheService,

    // Chains + tagger
    PriceChainService,
    FundChainService,
    NewsChainService,
    TickerTaggerService,

    // DI tokens — chains replace the scaffold adapter bindings.
    { provide: MARKET_DATA_PROVIDER, useClass: YahooFinanceProvider },
    { provide: PRICE_PROVIDER, useExisting: PriceChainService },
    { provide: CORPORATE_ACTIONS_PROVIDER, useExisting: NseAdapter },
    { provide: FUND_PROVIDER, useExisting: FundChainService },
    { provide: NEWS_PROVIDER, useExisting: NewsChainService },
  ],
  exports: [
    MarketDataService,

    YahooAdapter,
    NseAdapter,
    MfapiAdapter,
    AmfiAdapter,
    RssNewsAdapter,
    NewsDataIoAdapter,

    LookupService,
    DataVersionHashService,
    InstrumentMasterSeedRunner,
    InstrumentsRepository,
    FundsRepository,

    PriceHistoryRepository,
    NavHistoryRepository,
    AdjustmentService,

    MarketHolidayService,
    CircuitBreakerFactory,
    StaleCacheService,

    PriceChainService,
    FundChainService,
    NewsChainService,
    TickerTaggerService,

    PRICE_PROVIDER,
    CORPORATE_ACTIONS_PROVIDER,
    FUND_PROVIDER,
    NEWS_PROVIDER,
  ],
})
export class MarketDataModule {}
