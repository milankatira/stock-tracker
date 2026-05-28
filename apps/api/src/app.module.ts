import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ConfigService } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { ConfigModule } from "./config/config.module";
import { AnalysisModule } from "./modules/analysis/analysis.module";
import { AuthModule } from "./modules/auth/auth.module";
import { REDIS_CLIENT } from "./modules/cache/cache.constants";
import { CacheModule } from "./modules/cache/cache.module";
import { RedisThrottlerStorage } from "./modules/cache/redis-throttler.storage";
import type { RedisCacheClient } from "./modules/cache/cache.service";
import { HealthModule } from "./modules/health/health.module";
import { MarketDataModule } from "./modules/market-data/market-data.module";
import { NarrativeModule } from "./modules/narrative/narrative.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { UsersModule } from "./modules/users/users.module";
import { AppController } from "./app.controller";

/**
 * Root module.
 *
 * Wires:
 *   - ConfigModule (global, Zod-validated env — Plan 02 Task 1)
 *   - MongooseModule (async URI from validated config)
 *   - ThrottlerModule (baseline 100/min/IP backed by Redis so limits hold
 *     across API instances)
 *
 * HealthModule (Plan 02 Task 3) exposes liveness/readiness probes.
 */
@Module({
  imports: [
    ConfigModule,
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        uri: cfg.getOrThrow<string>("MONGO_URI"),
        autoIndex: false,
      }),
    }),
    ThrottlerModule.forRootAsync({
      imports: [CacheModule],
      inject: [REDIS_CLIENT],
      useFactory: (redis: RedisCacheClient) => ({
        storage: new RedisThrottlerStorage(redis),
        throttlers: [{ ttl: 60_000, limit: 100 }],
      }),
    }),
    AnalysisModule,
    AuthModule,
    CacheModule,
    HealthModule,
    MarketDataModule,
    NarrativeModule,
    ReportsModule,
    UsersModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
