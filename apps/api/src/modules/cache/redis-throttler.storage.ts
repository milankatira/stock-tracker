import type { ThrottlerStorage } from "@nestjs/throttler";
import type { RedisCacheClient } from "./cache.service";

interface ThrottlerRecord {
  readonly totalHits: number;
  readonly timeToExpire: number;
  readonly isBlocked: boolean;
  readonly timeToBlockExpire: number;
}

export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: RedisCacheClient) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerRecord> {
    const hitKey = this.key(throttlerName, key, "hits");
    const blockKey = this.key(throttlerName, key, "blocked");
    const existingBlockTtl = await this.redis.pttl(blockKey);

    if (existingBlockTtl > 0) {
      return {
        totalHits: await this.currentHits(hitKey),
        timeToExpire: this.toSeconds(await this.redis.pttl(hitKey)),
        isBlocked: true,
        timeToBlockExpire: this.toSeconds(existingBlockTtl),
      };
    }

    const totalHits = await this.redis.incr(hitKey);
    const hitTtl = await this.ensureTtl(hitKey, ttl);
    const isBlocked = totalHits > limit;

    if (isBlocked) {
      await this.redis.set(blockKey, "1", "PX", blockDuration);
    }

    return {
      totalHits,
      timeToExpire: this.toSeconds(hitTtl),
      isBlocked,
      timeToBlockExpire: isBlocked
        ? this.toSeconds(await this.redis.pttl(blockKey))
        : 0,
    };
  }

  private async ensureTtl(key: string, ttl: number): Promise<number> {
    const currentTtl = await this.redis.pttl(key);
    if (currentTtl > 0) return currentTtl;
    await this.redis.pexpire(key, ttl);
    return this.redis.pttl(key);
  }

  private async currentHits(key: string): Promise<number> {
    const raw = await this.redis.get(key);
    if (raw === null) return 0;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private key(throttlerName: string, key: string, suffix: string): string {
    return `throttle:${throttlerName}:${key}:${suffix}`;
  }

  private toSeconds(milliseconds: number): number {
    return milliseconds > 0 ? Math.ceil(milliseconds / 1000) : 0;
  }
}
