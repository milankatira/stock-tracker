import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthModule } from "../modules/auth/auth.module";
import { CacheModule } from "../modules/cache/cache.module";
import { MarketDataModule } from "../modules/market-data/market-data.module";
import { FundPeerSetService } from "./fund-peer-set.service";
import { FundReportsController } from "./fund-reports.controller";
import { FundReportsService } from "./fund-reports.service";
import { PeerSetService } from "./peer-set.service";
import { PricesController } from "./prices.controller";
import { PricesService } from "./prices.service";
import { ReportsService } from "./reports.service";
import { StockReportsController } from "./stock-reports.controller";
import {
  FundReportDocEntity,
  FundReportDocSchema,
} from "./schemas/fund-report-doc.schema";
import {
  StockReportDocEntity,
  StockReportDocSchema,
} from "./schemas/stock-report-doc.schema";

/**
 * Phase 4 precomputed-report module. Wires:
 *  - MongooseModule.forFeature for the StockReportDoc collection.
 *  - ReportsService (full implementation — replaces Plan 04-02 stub).
 *  - StockReportsController + PricesController behind AccessTokenGuard.
 *  - PeerSetService (peer-set fallback over the instrument master).
 *
 * Distinct from `apps/api/src/modules/reports/reports.module.ts`
 * (Phase 2 saved-report-history feature).
 */
@Module({
  imports: [
    ConfigModule,
    CacheModule,
    AuthModule,
    MarketDataModule,
    MongooseModule.forFeature([
      { name: StockReportDocEntity.name, schema: StockReportDocSchema },
      { name: FundReportDocEntity.name, schema: FundReportDocSchema },
    ]),
  ],
  controllers: [StockReportsController, PricesController, FundReportsController],
  providers: [
    ReportsService,
    PricesService,
    PeerSetService,
    FundReportsService,
    FundPeerSetService,
  ],
  exports: [
    ReportsService,
    PricesService,
    PeerSetService,
    FundReportsService,
    FundPeerSetService,
  ],
})
export class PrecomputedReportsModule {}
