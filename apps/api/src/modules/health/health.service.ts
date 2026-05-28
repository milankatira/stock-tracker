import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import {
  HealthCheckService,
  HealthIndicatorService,
  MongooseHealthIndicator,
  type HealthCheckResult,
  type HealthIndicatorResult,
} from "@nestjs/terminus";
import type { Connection } from "mongoose";
import { CacheService } from "../cache/cache.service";

export interface LivenessResponse {
  readonly status: "ok";
}

type RedisHealth = HealthIndicatorResult<
  "redis",
  "up" | "down",
  { pong?: string; message?: string }
>;

@Injectable()
export class HealthService {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mongo: MongooseHealthIndicator,
    private readonly indicator: HealthIndicatorService,
    private readonly cache: CacheService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  live(): LivenessResponse {
    return { status: "ok" };
  }

  async ready(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.mongo.pingCheck("mongo", { connection: this.connection, timeout: 1000 }),
      () => this.checkRedis(),
    ]);
  }

  private async checkRedis(): Promise<RedisHealth> {
    try {
      const pong = await this.cache.ping();
      return this.indicator.check("redis").up({ pong });
    } catch {
      return this.indicator.check("redis").down({ message: "Redis ping failed" });
    }
  }
}
