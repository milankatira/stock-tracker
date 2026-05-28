import { Inject, Injectable } from "@nestjs/common";
import { REDIS_CLIENT } from "../../modules/cache/cache.constants";
import type { RedisCacheClient } from "../../modules/cache/cache.service";

export interface ScoreSnapshot {
  readonly score: number;
  readonly verdict: "STRONG_SCORE" | "CAUTION" | "WEAK_SCORE";
  readonly asOfDate: string;
  readonly computedAt: string;
  readonly scoringEngineVersion: string;
}

const LATEST_TTL_SECONDS = 36 * 60 * 60;
const PREV_TTL_SECONDS = 7 * 24 * 60 * 60;
const ASOF_TTL_SECONDS = 36 * 60 * 60;

/**
 * Owns the Redis read path the Phase 5 +/- indicator depends on:
 *  - `score:latest:{id}` — most recently computed snapshot.
 *  - `score:prev:{id}`   — the snapshot displaced by the latest write
 *    (used to render the daily +/- delta).
 *  - `score:asof:{id}`   — most recent asOfDate processed (idempotency
 *    hint for the read path).
 *
 * Every key carries an explicit TTL (project rule `data/redis-always-ttl`).
 * Latest TTL > cron interval so a single missed nightly run does not
 * blank the UI.
 *
 * Atomicity: we GET-then-pipeline-SET rather than use a Lua script so
 * the same code works against `ioredis-mock` in tests. The BullMQ
 * jobId idempotency guarantee prevents duplicate concurrent calls for
 * the same `(instrumentId, asOfDate)`; intra-process safety is
 * sufficient here.
 */
@Injectable()
export class RedisScoreMaterialiser {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisCacheClient,
  ) {}

  async writeScore(
    instrumentId: string,
    snapshot: ScoreSnapshot,
  ): Promise<void> {
    const latestKey = this.latestKey(instrumentId);
    const prevKey = this.prevKey(instrumentId);
    const asofKey = this.asofKey(instrumentId);
    const serialised = JSON.stringify(snapshot);

    const current = await this.redis.get(latestKey);
    if (current) {
      await this.redis.set(prevKey, current, "EX", PREV_TTL_SECONDS);
    }
    await this.redis.set(latestKey, serialised, "EX", LATEST_TTL_SECONDS);
    await this.redis.set(asofKey, snapshot.asOfDate, "EX", ASOF_TTL_SECONDS);
  }

  async readLatest(instrumentId: string): Promise<ScoreSnapshot | null> {
    const raw = await this.redis.get(this.latestKey(instrumentId));
    return this.parse(raw);
  }

  async readPrev(instrumentId: string): Promise<ScoreSnapshot | null> {
    const raw = await this.redis.get(this.prevKey(instrumentId));
    return this.parse(raw);
  }

  async readAsOf(instrumentId: string): Promise<string | null> {
    return this.redis.get(this.asofKey(instrumentId));
  }

  private parse(raw: string | null): ScoreSnapshot | null {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ScoreSnapshot;
    } catch {
      return null;
    }
  }

  private latestKey(id: string): string {
    return `score:latest:${id}`;
  }

  private prevKey(id: string): string {
    return `score:prev:${id}`;
  }

  private asofKey(id: string): string {
    return `score:asof:${id}`;
  }
}
