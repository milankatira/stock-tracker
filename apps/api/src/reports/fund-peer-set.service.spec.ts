import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Model } from "mongoose";
import type { RedisCacheClient } from "../modules/cache/cache.service";
import { FundPeerSetService } from "./fund-peer-set.service";
import type { FundReportDocDocument } from "./schemas/fund-report-doc.schema";

interface MockRedis extends RedisCacheClient {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
}

function makeRedis(): MockRedis {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
  } as unknown as MockRedis;
}

function makeModel() {
  return {
    findOne: vi.fn(),
    find: vi.fn(),
  } as unknown as Model<FundReportDocDocument>;
}

function leanExec<T>(value: T) {
  const chain: Record<string, unknown> = {
    lean: () => ({ exec: () => Promise.resolve(value) }),
    exec: () => Promise.resolve(value),
  };
  chain.select = () => chain;
  chain.sort = () => chain;
  chain.limit = () => chain;
  return chain as never;
}

describe("FundPeerSetService.getPeers", () => {
  let redis: MockRedis;
  let model: ReturnType<typeof makeModel>;
  let service: FundPeerSetService;

  beforeEach(() => {
    redis = makeRedis();
    model = makeModel();
    service = new FundPeerSetService(model, redis);
  });

  it("returns the top 3 same-category peers by AUM proximity (log scale)", async () => {
    vi.mocked(model.findOne).mockReturnValueOnce(
      leanExec({ category: "Large Cap", meta: { aumCr: 10000 } }),
    );
    vi.mocked(model.find).mockReturnValueOnce(
      leanExec([
        { schemeCode: "120001", name: "F1", score: { value: 7 }, meta: { aumCr: 9000 } },
        { schemeCode: "120002", name: "F2", score: { value: 5 }, meta: { aumCr: 8000 } },
        { schemeCode: "120003", name: "F3", score: { value: 6 }, meta: { aumCr: 50000 } },
        { schemeCode: "120004", name: "F4", score: { value: 4 }, meta: { aumCr: 100 } },
      ]),
    );

    const peers = await service.getPeers("120000");

    expect(peers).toHaveLength(3);
    expect(peers.map((p) => p.schemeCode)).toEqual(["120001", "120002", "120003"]);
  });

  it("caches the result in Redis for 24h", async () => {
    vi.mocked(model.findOne).mockReturnValueOnce(
      leanExec({ category: "Mid Cap", meta: { aumCr: 5000 } }),
    );
    vi.mocked(model.find).mockReturnValueOnce(leanExec([]));

    await service.getPeers("120999");

    expect(redis.set).toHaveBeenCalledWith(
      "peers:fund:120999",
      JSON.stringify([]),
      "EX",
      86400,
    );
  });

  it("returns [] when subject scheme not found", async () => {
    vi.mocked(model.findOne).mockReturnValueOnce(leanExec(null));

    await expect(service.getPeers("404")).resolves.toEqual([]);
  });
});

describe("FundPeerSetService.getHigherScoringPeers", () => {
  let redis: MockRedis;
  let model: ReturnType<typeof makeModel>;
  let service: FundPeerSetService;

  beforeEach(() => {
    redis = makeRedis();
    model = makeModel();
    service = new FundPeerSetService(model, redis);
  });

  it("returns empty when subject score is at or above the 6.0 threshold", async () => {
    vi.mocked(model.findOne).mockReturnValueOnce(
      leanExec({ category: "Large Cap", score: { value: 7 } }),
    );

    await expect(service.getHigherScoringPeers("120000")).resolves.toEqual([]);
  });

  it("returns up to 3 same-category peers with higher score and computed delta", async () => {
    vi.mocked(model.findOne).mockReturnValueOnce(
      leanExec({ category: "Large Cap", score: { value: 4 } }),
    );
    vi.mocked(model.find).mockReturnValueOnce(
      leanExec([
        { schemeCode: "120100", name: "Top Fund", score: { value: 9 } },
        { schemeCode: "120101", name: "Mid Fund", score: { value: 7 } },
        { schemeCode: "120102", name: "OK Fund", score: { value: 6 } },
      ]),
    );

    const peers = await service.getHigherScoringPeers("120000");

    expect(peers).toEqual([
      { schemeCode: "120100", name: "Top Fund", score: 9, scoreDelta: 5 },
      { schemeCode: "120101", name: "Mid Fund", score: 7, scoreDelta: 3 },
      { schemeCode: "120102", name: "OK Fund", score: 6, scoreDelta: 2 },
    ]);
  });

  it("returns [] when subject not found", async () => {
    vi.mocked(model.findOne).mockReturnValueOnce(leanExec(null));
    await expect(service.getHigherScoringPeers("xyz")).resolves.toEqual([]);
  });
});
