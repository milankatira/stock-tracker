import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import {
  connect,
  disconnect,
  model,
  Schema,
  Types,
  type Model,
} from "mongoose";
import {
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { InstrumentSchema } from "../modules/market-data/instruments/instrument.schema";
import { WatchlistSchema } from "./schemas/watchlist.schema";
import { CacheService } from "../modules/cache/cache.service";
import type { RedisCacheClient } from "../modules/cache/cache.service";
import { WatchlistService } from "./watchlist.service";

let replset: MongoMemoryReplSet;

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connect(replset.getUri());
}, 60_000);

afterAll(async () => {
  await disconnect();
  await replset.stop();
});

type AnyModel = Model<Record<string, unknown>>;

const looseWatchlistSchema = new Schema(
  WatchlistSchema.obj as unknown as Record<string, never>,
  {
    collection: "test_watchlists",
    timestamps: true,
    optimisticConcurrency: true,
  },
);
const looseInstrumentSchema = new Schema(
  InstrumentSchema.obj as unknown as Record<string, never>,
  {
    collection: "test_watchlist_instruments",
    timestamps: true,
    collation: { locale: "en", strength: 2 },
  },
);

const WatchlistModel = model("WatchlistTest", looseWatchlistSchema) as unknown as AnyModel;
const InstrumentModel = model(
  "WatchlistInstrumentTest",
  looseInstrumentSchema,
) as unknown as AnyModel;

interface MockRedis extends RedisCacheClient {
  mget: ReturnType<typeof vi.fn>;
  store: Map<string, string>;
}

function makeRedis(seed: Record<string, string> = {}): MockRedis {
  const store = new Map(Object.entries(seed));
  return {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async () => "OK"),
    del: vi.fn(async (k: string) => (store.delete(k) ? 1 : 0)),
    mget: vi.fn(async (...keys: string[]) =>
      keys.map((k) => store.get(k) ?? null),
    ),
    store,
  } as unknown as MockRedis;
}

function makeCache(redis: MockRedis): CacheService {
  return {
    get: redis.get,
    set: redis.set,
    del: redis.del,
  } as unknown as CacheService;
}

async function seedInstrument(name: string): Promise<string> {
  const created = await InstrumentModel.create({
    nseSymbol: name,
    yahooSymbol: `${name}.NS`,
    name: `${name} Inc`,
    primaryExchange: "NSE",
    popularity: 100_000,
  });
  return String(created._id);
}

describe("WatchlistService", () => {
  let service: WatchlistService;
  let redis: MockRedis;

  beforeEach(async () => {
    await WatchlistModel.deleteMany({}).exec();
    await InstrumentModel.deleteMany({}).exec();
    redis = makeRedis();
    service = new WatchlistService(
      WatchlistModel as never,
      InstrumentModel as never,
      redis,
      makeCache(redis),
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it("returns empty items without touching Redis when the user has no doc", async () => {
    const res = await service.getWithScores("user-1");
    expect(res.items).toEqual([]);
    expect(redis.mget).not.toHaveBeenCalled();
  });

  it("addItem persists the entry, busts the cache, and is idempotent on duplicates", async () => {
    const iid = await seedInstrument("AAA");
    await service.addItem("user-1", { instrumentId: iid, instrumentType: "STOCK" });
    await service.addItem("user-1", { instrumentId: iid, instrumentType: "STOCK" });

    const doc = await WatchlistModel.findOne({ userId: "user-1" }).lean().exec();
    expect((doc as unknown as { instruments: unknown[] }).instruments).toHaveLength(1);
    expect(redis.del).toHaveBeenCalledWith("watchlist:user:user-1");
  });

  it("addItem rejects unknown instruments with BadRequestException", async () => {
    const fakeId = new Types.ObjectId().toHexString();
    await expect(
      service.addItem("user-1", { instrumentId: fakeId, instrumentType: "STOCK" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("addItem rejects when the watchlist would exceed 200 entries", async () => {
    const iid = await seedInstrument("AAA");
    const filler = Array.from({ length: 200 }, () => ({
      instrumentId: new Types.ObjectId(),
      instrumentType: "STOCK",
      addedAt: new Date(),
    }));
    await WatchlistModel.create({ userId: "user-1", instruments: filler });

    await expect(
      service.addItem("user-1", { instrumentId: iid, instrumentType: "STOCK" }),
    ).rejects.toThrow(/Watchlist limit reached \(200\)/);
  });

  it("removeItem returns NotFoundException when the user has no doc", async () => {
    const iid = new Types.ObjectId().toHexString();
    await expect(service.removeItem("user-2", iid)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("removeItem pulls the entry and busts the cache", async () => {
    const iid = await seedInstrument("BBB");
    await service.addItem("user-1", { instrumentId: iid, instrumentType: "STOCK" });
    vi.mocked(redis.del).mockClear();

    await service.removeItem("user-1", iid);
    const doc = await WatchlistModel.findOne({ userId: "user-1" }).lean().exec();
    expect((doc as unknown as { instruments: unknown[] }).instruments).toHaveLength(0);
    expect(redis.del).toHaveBeenCalledWith("watchlist:user:user-1");
  });

  it("isolates one user's watchlist from another's", async () => {
    const a = await seedInstrument("AAA");
    const b = await seedInstrument("BBB");
    await service.addItem("user-1", { instrumentId: a, instrumentType: "STOCK" });
    await service.addItem("user-2", { instrumentId: b, instrumentType: "STOCK" });

    const r1 = await service.getWithScores("user-1");
    const r2 = await service.getWithScores("user-2");
    expect(r1.items.map((i) => i.instrumentId)).toEqual([a]);
    expect(r2.items.map((i) => i.instrumentId)).toEqual([b]);
  });

  it("joins latest + previous score from Redis and computes the delta", async () => {
    const a = await seedInstrument("AAA");
    await service.addItem("user-1", { instrumentId: a, instrumentType: "STOCK" });
    redis.store.set(
      `score:latest:${a}`,
      JSON.stringify({ score: 7.5, verdict: "STRONG_SCORE" }),
    );
    redis.store.set(
      `score:prev:${a}`,
      JSON.stringify({ score: 6.5, verdict: "CAUTION" }),
    );

    const res = await service.getWithScores("user-1");
    expect(res.items[0]).toMatchObject({
      instrumentId: a,
      latestScore: 7.5,
      previousScore: 6.5,
      delta: 1,
    });
  });

  it("renders nulls when neither Redis key is populated", async () => {
    const a = await seedInstrument("AAA");
    await service.addItem("user-1", { instrumentId: a, instrumentType: "STOCK" });

    const res = await service.getWithScores("user-1");
    expect(res.items[0]).toMatchObject({
      latestScore: null,
      previousScore: null,
      delta: null,
    });
  });

  it("renders delta as null when only latest score is present", async () => {
    const a = await seedInstrument("AAA");
    await service.addItem("user-1", { instrumentId: a, instrumentType: "STOCK" });
    redis.store.set(
      `score:latest:${a}`,
      JSON.stringify({ score: 8, verdict: "STRONG_SCORE" }),
    );

    const res = await service.getWithScores("user-1");
    expect(res.items[0]).toMatchObject({
      latestScore: 8,
      previousScore: null,
      delta: null,
    });
  });
});
