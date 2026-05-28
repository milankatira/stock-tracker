import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { REDIS_CLIENT } from "../../cache/cache.constants";
import type { RedisCacheClient } from "../../cache/cache.service";

export interface StaleReadResult<T> {
  readonly value: T;
  readonly stalenessSeconds: number;
}

interface StaleEnvelope<T> {
  readonly value: T;
  readonly storedAt: number;
}

const KEY_PREFIX = "market-data:stale:";

/**
 * Redis-backed last-known-good cache for the provider chains.
 *
 * Every write MUST carry an explicit TTL (project rule
 * `data/redis-always-ttl`) — `write()` throws when `ttlSeconds <= 0` or
 * non-finite.
 *
 * `read()` returns the deserialised value alongside how many seconds
 * have elapsed since it was stored, so the chain can report
 * `{ status: 'stale', stalenessSeconds }` to downstream callers.
 */
@Injectable()
export class StaleCacheService {
  private readonly logger = new Logger(StaleCacheService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisCacheClient,
  ) {}

  async write<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      throw new BadRequestException(
        `StaleCacheService.write requires positive ttlSeconds (got ${ttlSeconds}) for key ${key}`,
      );
    }
    const envelope: StaleEnvelope<T> = {
      value,
      storedAt: Date.now(),
    };
    await this.redis.set(
      this.fullKey(key),
      JSON.stringify(envelope),
      "EX",
      Math.floor(ttlSeconds),
    );
  }

  async read<T>(key: string): Promise<StaleReadResult<T> | null> {
    const raw = await this.redis.get(this.fullKey(key));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as StaleEnvelope<T>;
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        typeof parsed.storedAt !== "number"
      ) {
        return null;
      }
      const stalenessSeconds = Math.max(
        0,
        Math.floor((Date.now() - parsed.storedAt) / 1000),
      );
      return { value: parsed.value, stalenessSeconds };
    } catch (err) {
      this.logger.warn(
        { key, message: err instanceof Error ? err.message : "unknown" },
        "stale_cache_parse_failed",
      );
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(this.fullKey(key));
  }

  private fullKey(key: string): string {
    return `${KEY_PREFIX}${key}`;
  }
}
