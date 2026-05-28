import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RedisMock from "ioredis-mock";
import { CacheService } from "./cache.service";
import type { RedisCacheClient } from "./cache.service";

describe("CacheService", () => {
  let redis: RedisCacheClient;
  let service: CacheService;

  beforeEach(() => {
    redis = new RedisMock() as unknown as RedisCacheClient;
    service = new CacheService(redis);
  });

  afterEach(async () => {
    await redis.quit();
  });

  it("set + get round-trips JSON values with the required TTL", async () => {
    const setSpy = vi.spyOn(redis, "set");

    await service.set("k", { hello: "world" }, 60);

    expect(setSpy).toHaveBeenCalledWith("k", JSON.stringify({ hello: "world" }), "EX", 60);
    await expect(service.get("k")).resolves.toEqual({ hello: "world" });
  });

  it.each([0, -5, Number.NaN])("rejects invalid ttlSeconds: %s", async (ttlSeconds) => {
    await expect(service.set("k", "v", ttlSeconds)).rejects.toThrow(
      new RegExp(`ttlSeconds must be > 0 \\(got ${String(ttlSeconds)}\\)`),
    );
  });

  it("returns null for missing keys", async () => {
    await expect(service.get("missing")).resolves.toBeNull();
  });

  it("deletes keys", async () => {
    await service.set("k", "v", 60);
    await service.del("k");

    await expect(service.get("k")).resolves.toBeNull();
  });

  it("pings the shared Redis client for readiness checks", async () => {
    await expect(service.ping()).resolves.toBe("PONG");
  });

  it("getOrSet calls the producer on miss and reuses the cached value on hit", async () => {
    const producer = vi.fn(async () => ({ fresh: true }));

    await expect(service.getOrSet("k", 60, producer)).resolves.toEqual({ fresh: true });
    await expect(service.getOrSet("k", 60, producer)).resolves.toEqual({ fresh: true });
    expect(producer).toHaveBeenCalledTimes(1);
  });

  it("wraps invalid cached JSON with key context", async () => {
    await redis.set("bad-json", "{", "EX", 60);

    await expect(service.get("bad-json")).rejects.toThrow(
      "CacheService.get: invalid cached JSON for key bad-json",
    );
  });
});
