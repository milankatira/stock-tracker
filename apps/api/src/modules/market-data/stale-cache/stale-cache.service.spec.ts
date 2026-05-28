import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import type { RedisCacheClient } from "../../cache/cache.service";
import { StaleCacheService } from "./stale-cache.service";

function makeRedisStub(initial: Record<string, string> = {}): RedisCacheClient {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (...args: unknown[]) => {
      const [key, value] = args as [string, string];
      store.set(key, value);
      return "OK";
    }),
    del: vi.fn(async (key: string) => {
      const existed = store.delete(key);
      return existed ? 1 : 0;
    }),
  } as unknown as RedisCacheClient;
}

describe("StaleCacheService", () => {
  it("rejects writes without a positive TTL", async () => {
    const redis = makeRedisStub();
    const service = new StaleCacheService(redis);

    await expect(service.write("price:RELIANCE", { p: 1 }, 0)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.write("price:RELIANCE", { p: 1 }, -5)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.write("price:RELIANCE", { p: 1 }, Number.NaN),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("writes a JSON envelope with the configured TTL via SET EX", async () => {
    const redis = makeRedisStub();
    const service = new StaleCacheService(redis);

    await service.write("price:RELIANCE", { price: 2540 }, 900);

    expect(redis.set).toHaveBeenCalledWith(
      "market-data:stale:price:RELIANCE",
      expect.stringContaining('"price":2540'),
      "EX",
      900,
    );
  });

  it("round-trips a value with monotonically non-decreasing stalenessSeconds", async () => {
    const redis = makeRedisStub();
    const service = new StaleCacheService(redis);

    await service.write("price:RELIANCE", { price: 2540 }, 60);
    const first = await service.read<{ price: number }>("price:RELIANCE");

    expect(first?.value).toEqual({ price: 2540 });
    expect(first?.stalenessSeconds).toBeGreaterThanOrEqual(0);
  });

  it("returns null when the key is absent or the payload is malformed", async () => {
    const redis = makeRedisStub({
      "market-data:stale:price:GARBAGE": "not-json",
    });
    const service = new StaleCacheService(redis);

    await expect(service.read("price:MISSING")).resolves.toBeNull();
    await expect(service.read("price:GARBAGE")).resolves.toBeNull();
  });

  it("delegates delete to the Redis client", async () => {
    const redis = makeRedisStub({
      "market-data:stale:price:RELIANCE": JSON.stringify({
        value: 1,
        storedAt: Date.now(),
      }),
    });
    const service = new StaleCacheService(redis);

    await service.delete("price:RELIANCE");

    expect(redis.del).toHaveBeenCalledWith("market-data:stale:price:RELIANCE");
  });
});
