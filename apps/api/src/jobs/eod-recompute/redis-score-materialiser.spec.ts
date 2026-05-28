import { describe, expect, it, vi } from "vitest";
import type { RedisCacheClient } from "../../modules/cache/cache.service";
import {
  RedisScoreMaterialiser,
  type ScoreSnapshot,
} from "./redis-score-materialiser";

function snapshot(score: number, asOfDate: string): ScoreSnapshot {
  return {
    score,
    verdict: "CAUTION",
    asOfDate,
    computedAt: `${asOfDate}T12:30:00.000Z`,
    scoringEngineVersion: "0.1.0",
  };
}

interface InMemoryRedis extends RedisCacheClient {
  readonly store: Map<string, { value: string; ttlSeconds: number }>;
}

function makeRedis(): InMemoryRedis {
  const store = new Map<string, { value: string; ttlSeconds: number }>();
  const client: Partial<InMemoryRedis> = {
    store,
    get: vi.fn(async (key: string) => store.get(key)?.value ?? null),
    set: vi.fn(async (key: string, value: string, _mode: "EX" | "PX", ttl: number) => {
      store.set(key, { value, ttlSeconds: ttl });
      return "OK" as const;
    }),
    del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
    pttl: vi.fn(async (key: string) => {
      const entry = store.get(key);
      return entry ? entry.ttlSeconds * 1000 : -2;
    }),
  };
  return client as InMemoryRedis;
}

describe("RedisScoreMaterialiser.writeScore", () => {
  it("on the first write sets latest + asof, leaves prev unset", async () => {
    const redis = makeRedis();
    const materialiser = new RedisScoreMaterialiser(redis);
    const snap = snapshot(7.5, "2026-05-27");

    await materialiser.writeScore("i-1", snap);

    expect(redis.store.has("score:latest:i-1")).toBe(true);
    expect(redis.store.has("score:prev:i-1")).toBe(false);
    expect(redis.store.get("score:asof:i-1")?.value).toBe("2026-05-27");

    const stored = JSON.parse(redis.store.get("score:latest:i-1")!.value);
    expect(stored.score).toBe(7.5);
  });

  it("rotates latest → prev on subsequent writes", async () => {
    const redis = makeRedis();
    const materialiser = new RedisScoreMaterialiser(redis);

    await materialiser.writeScore("i-1", snapshot(7.0, "2026-05-26"));
    await materialiser.writeScore("i-1", snapshot(7.5, "2026-05-27"));

    expect(JSON.parse(redis.store.get("score:latest:i-1")!.value).score).toBe(
      7.5,
    );
    expect(JSON.parse(redis.store.get("score:prev:i-1")!.value).score).toBe(
      7.0,
    );
    expect(redis.store.get("score:asof:i-1")?.value).toBe("2026-05-27");
  });

  it("rotates twice over three writes — each prev is the immediately prior latest", async () => {
    const redis = makeRedis();
    const materialiser = new RedisScoreMaterialiser(redis);

    await materialiser.writeScore("i-1", snapshot(6.0, "2026-05-25"));
    await materialiser.writeScore("i-1", snapshot(7.0, "2026-05-26"));
    await materialiser.writeScore("i-1", snapshot(7.5, "2026-05-27"));

    expect(JSON.parse(redis.store.get("score:latest:i-1")!.value).score).toBe(
      7.5,
    );
    expect(JSON.parse(redis.store.get("score:prev:i-1")!.value).score).toBe(
      7.0,
    );
  });

  it("sets explicit TTLs (latest 36h, prev 7d, asof 36h)", async () => {
    const redis = makeRedis();
    const materialiser = new RedisScoreMaterialiser(redis);

    await materialiser.writeScore("i-1", snapshot(7.0, "2026-05-26"));
    await materialiser.writeScore("i-1", snapshot(7.5, "2026-05-27"));

    expect(redis.store.get("score:latest:i-1")?.ttlSeconds).toBe(36 * 60 * 60);
    expect(redis.store.get("score:prev:i-1")?.ttlSeconds).toBe(7 * 24 * 60 * 60);
    expect(redis.store.get("score:asof:i-1")?.ttlSeconds).toBe(36 * 60 * 60);
  });

  it("readLatest / readPrev / readAsOf return the parsed snapshots", async () => {
    const redis = makeRedis();
    const materialiser = new RedisScoreMaterialiser(redis);
    const snap = snapshot(7.5, "2026-05-27");

    await materialiser.writeScore("i-1", snapshot(7.0, "2026-05-26"));
    await materialiser.writeScore("i-1", snap);

    await expect(materialiser.readLatest("i-1")).resolves.toMatchObject({
      score: 7.5,
    });
    await expect(materialiser.readPrev("i-1")).resolves.toMatchObject({
      score: 7.0,
    });
    await expect(materialiser.readAsOf("i-1")).resolves.toBe("2026-05-27");
  });

  it("readLatest returns null for missing key and null for malformed JSON", async () => {
    const redis = makeRedis();
    redis.store.set("score:latest:bad", { value: "not-json", ttlSeconds: 60 });
    const materialiser = new RedisScoreMaterialiser(redis);

    await expect(materialiser.readLatest("i-missing")).resolves.toBeNull();
    await expect(materialiser.readLatest("bad")).resolves.toBeNull();
  });
});
