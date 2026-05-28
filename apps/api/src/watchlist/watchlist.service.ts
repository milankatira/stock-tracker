import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Types, type Model } from "mongoose";
import {
  WATCHLIST_MAX_ITEMS,
  type WatchlistItem,
  type WatchlistResponse,
} from "@finsight/shared";
import { REDIS_CLIENT } from "../modules/cache/cache.constants";
import type { RedisCacheClient } from "../modules/cache/cache.service";
import { CacheService } from "../modules/cache/cache.service";
import {
  Instrument,
  type InstrumentDocument,
} from "../modules/market-data/instruments/instrument.schema";
import {
  Watchlist,
  type WatchlistDocument,
} from "./schemas/watchlist.schema";

interface AddItemInput {
  readonly instrumentId: string;
  readonly instrumentType: "STOCK" | "FUND";
}

interface RawSnapshot {
  readonly score?: number;
}

const RETRY_LIMIT = 1;

/**
 * Per-user watchlist with a Redis-joined daily score / delta on every
 * read. `userId` is supplied exclusively by the JWT-authenticated guard
 * on the controller — never trust client-supplied owner fields.
 *
 * Read path: one `findOne` for the Mongo doc, then one batched `MGET`
 * across `score:latest:<id>` + `score:prev:<id>` written by the Phase 3
 * EOD materialiser. No `$lookup`, no N+1 fan-out.
 */
@Injectable()
export class WatchlistService {
  private readonly logger = new Logger(WatchlistService.name);

  constructor(
    @InjectModel(Watchlist.name)
    private readonly model: Model<WatchlistDocument>,
    @InjectModel(Instrument.name)
    private readonly instruments: Model<InstrumentDocument>,
    @Inject(REDIS_CLIENT) private readonly redis: RedisCacheClient,
    private readonly cache: CacheService,
  ) {}

  async getWithScores(userId: string): Promise<WatchlistResponse> {
    const doc = await this.model.findOne({ userId }).lean().exec();
    if (!doc || doc.instruments.length === 0) {
      return { items: [] };
    }

    const ids = doc.instruments.map((i) => String(i.instrumentId));
    const latestKeys = ids.map((id) => `score:latest:${id}`);
    const prevKeys = ids.map((id) => `score:prev:${id}`);

    const [latestRaw, prevRaw] = await Promise.all([
      this.mget(latestKeys),
      this.mget(prevKeys),
    ]);

    const items: WatchlistItem[] = doc.instruments.map((entry, idx) => {
      const latest = this.parseScore(latestRaw[idx]);
      const previous = this.parseScore(prevRaw[idx]);
      const delta =
        latest !== null && previous !== null
          ? Number((latest - previous).toFixed(2))
          : null;
      return {
        instrumentId: String(entry.instrumentId),
        instrumentType: entry.instrumentType,
        addedAt: new Date(entry.addedAt).toISOString(),
        latestScore: latest,
        previousScore: previous,
        delta,
      };
    });

    return { items };
  }

  async addItem(userId: string, input: AddItemInput): Promise<void> {
    if (!Types.ObjectId.isValid(input.instrumentId)) {
      throw new BadRequestException("Invalid instrument id");
    }
    const instrument = await this.instruments
      .findOne({ _id: new Types.ObjectId(input.instrumentId) }, { _id: 1 })
      .lean()
      .exec();
    if (!instrument) {
      throw new BadRequestException("Unknown instrument");
    }

    const current = await this.model
      .findOne({ userId }, { instruments: 1 })
      .lean()
      .exec();
    const already = current?.instruments.find(
      (i) => String(i.instrumentId) === input.instrumentId,
    );
    if (already) return;

    if (current && current.instruments.length >= WATCHLIST_MAX_ITEMS) {
      throw new BadRequestException(
        `Watchlist limit reached (${WATCHLIST_MAX_ITEMS})`,
      );
    }

    await this.withRetry(() =>
      this.model
        .updateOne(
          { userId },
          {
            $setOnInsert: { userId },
            $addToSet: {
              instruments: {
                instrumentId: new Types.ObjectId(input.instrumentId),
                instrumentType: input.instrumentType,
                addedAt: new Date(),
              },
            },
          },
          { upsert: true },
        )
        .exec(),
    );

    await this.bust(userId);
  }

  async removeItem(userId: string, instrumentId: string): Promise<void> {
    if (!Types.ObjectId.isValid(instrumentId)) {
      throw new BadRequestException("Invalid instrument id");
    }
    const res = await this.model
      .updateOne(
        { userId },
        {
          $pull: {
            instruments: {
              instrumentId: new Types.ObjectId(instrumentId),
            },
          },
        },
      )
      .exec();
    if (res.matchedCount === 0) {
      throw new NotFoundException("Watchlist not found");
    }
    await this.bust(userId);
  }

  private async mget(keys: readonly string[]): Promise<readonly (string | null)[]> {
    if (keys.length === 0) return [];
    // ioredis-mock supports variadic mget(...keys); RedisCacheClient
    // does not expose mget explicitly, so use the underlying client.
    type RedisWithMget = RedisCacheClient & {
      mget: (...args: string[]) => Promise<Array<string | null>>;
    };
    const client = this.redis as RedisWithMget;
    if (typeof client.mget !== "function") {
      // Fallback: sequential GETs for environments without mget.
      const out: Array<string | null> = [];
      for (const k of keys) {
        out.push(await this.redis.get(k));
      }
      return out;
    }
    return client.mget(...keys);
  }

  private parseScore(raw: string | null): number | null {
    if (raw === null || raw === "") return null;
    try {
      const parsed = JSON.parse(raw) as RawSnapshot;
      if (typeof parsed?.score === "number" && Number.isFinite(parsed.score)) {
        return parsed.score;
      }
      return null;
    } catch {
      // Older fixtures stored a bare number — be tolerant.
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
  }

  private async bust(userId: string): Promise<void> {
    try {
      await this.cache.del(`watchlist:user:${userId}`);
    } catch (err) {
      this.logger.warn(
        { userId, message: err instanceof Error ? err.message : "unknown" },
        "watchlist_cache_del_failed",
      );
    }
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt <= RETRY_LIMIT; attempt += 1) {
      try {
        return await fn();
      } catch (err) {
        if (attempt >= RETRY_LIMIT) throw err;
        if (
          err instanceof Error &&
          (err.name === "VersionError" ||
            err.message.toLowerCase().includes("version"))
        ) {
          continue;
        }
        throw err;
      }
    }
    throw new Error("unreachable");
  }
}
