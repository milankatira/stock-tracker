import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { REDIS_CLIENT } from "./cache.constants";
import { CacheService, type RedisCacheClient } from "./cache.service";

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: async (config: ConfigService): Promise<RedisCacheClient> => {
        if (config.getOrThrow<string>("NODE_ENV") === "test") {
          const RedisMock = (await import("ioredis-mock")).default;
          return new RedisMock() as unknown as RedisCacheClient;
        }

        return new Redis(config.getOrThrow<string>("REDIS_URL"), {
          enableReadyCheck: true,
          maxRetriesPerRequest: 3,
        }) as RedisCacheClient;
      },
    },
    CacheService,
  ],
  exports: [CacheService, REDIS_CLIENT],
})
export class CacheModule {}
