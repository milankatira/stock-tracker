import { afterEach, beforeEach, describe, expect, it } from "vitest";
import RedisMock from "ioredis-mock";
import { RedisThrottlerStorage } from "./redis-throttler.storage";
import type { RedisCacheClient } from "./cache.service";

describe("RedisThrottlerStorage", () => {
  let redis: RedisCacheClient;
  let storage: RedisThrottlerStorage;

  beforeEach(() => {
    redis = new RedisMock() as unknown as RedisCacheClient;
    storage = new RedisThrottlerStorage(redis);
  });

  afterEach(async () => {
    await redis.quit();
  });

  it("increments hits with a TTL-backed Redis key", async () => {
    const first = await storage.increment("ip-1", 60_000, 2, 30_000, "default");
    const second = await storage.increment("ip-1", 60_000, 2, 30_000, "default");

    expect(first.totalHits).toBe(1);
    expect(second.totalHits).toBe(2);
    expect(second.isBlocked).toBe(false);
    expect(second.timeToExpire).toBeGreaterThan(0);
    expect(await redis.pttl("throttle:default:ip-1:hits")).toBeGreaterThan(0);
  });

  it("sets a separate block key when the request limit is exceeded", async () => {
    await storage.increment("ip-2", 60_000, 1, 30_000, "default");

    const blocked = await storage.increment("ip-2", 60_000, 1, 30_000, "default");

    expect(blocked.totalHits).toBe(2);
    expect(blocked.isBlocked).toBe(true);
    expect(blocked.timeToBlockExpire).toBeGreaterThan(0);
    expect(await redis.pttl("throttle:default:ip-2:blocked")).toBeGreaterThan(0);
  });
});
