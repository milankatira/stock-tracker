import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { ActiveInstrumentProvider } from "./active-instrument.provider";
import { CacheModule } from "../../modules/cache/cache.module";
import { EodRecomputeProcessor } from "./eod-recompute.processor";
import { EodRecomputeProducer } from "./eod-recompute.producer";
import {
  EOD_QUEUE_NAME,
  EOD_SCHEDULER_KEY,
} from "./eod-recompute.types";
import { MarketDataModule } from "../../modules/market-data/market-data.module";
import { RedisScoreMaterialiser } from "./redis-score-materialiser";
import { ScoreHistoryBootstrap } from "./score-history.bootstrap";
import { ScoreHistoryRepository } from "./score-history.repository";
import {
  ScoreHistory,
  ScoreHistorySchema,
} from "./score-history.schema";
import { FundsScoreLoader, StocksScoreLoader } from "./score-loaders";
import { ScoringEngineVersionProvider } from "./scoring-engine-version.provider";

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        connection: { url: cfg.getOrThrow<string>("REDIS_URL") },
      }),
    }),
    BullModule.registerQueue({ name: EOD_QUEUE_NAME }),
    MongooseModule.forFeature([
      { name: ScoreHistory.name, schema: ScoreHistorySchema },
    ]),
    CacheModule,
    MarketDataModule,
  ],
  providers: [
    ScoreHistoryRepository,
    ScoreHistoryBootstrap,
    ScoringEngineVersionProvider,
    RedisScoreMaterialiser,
    ActiveInstrumentProvider,
    StocksScoreLoader,
    FundsScoreLoader,
    EodRecomputeProducer,
    EodRecomputeProcessor,
  ],
  exports: [
    BullModule,
    ScoreHistoryRepository,
    RedisScoreMaterialiser,
    EodRecomputeProducer,
  ],
})
export class EodRecomputeModule {}

export { EOD_QUEUE_NAME, EOD_SCHEDULER_KEY };
