import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { REDIS_CLIENT } from "./cache.constants";

export interface RedisCacheClient {
  set(
    key: string,
    value: string,
    mode: "EX" | "PX",
    ttl: number,
  ): Promise<"OK" | null>;
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  pexpire(key: string, milliseconds: number): Promise<number>;
  pttl(key: string): Promise<number>;
  del(key: string): Promise<number>;
  ping(): Promise<string>;
  quit(): Promise<unknown>;
}

@Injectable()
export class CacheService implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisCacheClient) {}

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.assertValidTtl(ttlSeconds, "CacheService.set");
    await this.redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    if (raw === null) return null;

    try {
      return JSON.parse(raw) as T;
    } catch (cause) {
      throw new Error(`CacheService.get: invalid cached JSON for key ${key}`, { cause });
    }
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async ping(): Promise<string> {
    return this.redis.ping();
  }

  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    producer: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const fresh = await producer();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  private assertValidTtl(ttlSeconds: number, operation: string): void {
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      throw new Error(`${operation}: ttlSeconds must be > 0 (got ${String(ttlSeconds)})`);
    }
  }
}
