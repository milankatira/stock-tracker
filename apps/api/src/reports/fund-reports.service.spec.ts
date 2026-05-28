import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import type { Model } from "mongoose";
import { makeVerdict, type FundReportDoc } from "@finsight/shared";
import {
  ANALYSIS_DISCLAIMER,
  PAST_PERF_DISCLAIMER,
} from "../compliance/disclaimers.constants";
import type { CacheService } from "../modules/cache/cache.service";
import type { FundPeerSetService } from "./fund-peer-set.service";
import { FundReportsService } from "./fund-reports.service";
import type { FundReportDocDocument } from "./schemas/fund-report-doc.schema";

function makeCache() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
  } as unknown as CacheService;
}

function makeModel() {
  return {
    findOne: vi.fn(),
    updateOne: vi.fn(),
  } as unknown as Model<FundReportDocDocument>;
}

function makeConfig(overrides: Record<string, string | undefined> = {}) {
  return {
    get: vi.fn((key: string) => overrides[key]),
  } as unknown as ConfigService;
}

function makePeerSet(higher: ReturnType<typeof vi.fn>) {
  return {
    getPeers: vi.fn().mockResolvedValue([]),
    getHigherScoringPeers: higher,
  } as unknown as FundPeerSetService;
}

const baseDoc: FundReportDoc = {
  schemeCode: "120000",
  name: "Sample Large Cap Fund",
  category: "Large Cap",
  asOf: "2026-05-27T00:00:00.000Z",
  dataVersionHash: "v1",
  score: {
    value: 7,
    verdict: makeVerdict("STRONG_SCORE"),
    pillars: {
      returns: 8,
      riskAdjusted: 7,
      consistency: 6,
      costs: 7,
      manager: 7,
      portfolio: 6,
    },
    weightsVersion: "0.1.0",
  },
  returns: {
    fund: { "1y": 18, "3y": 14, "5y": 12, "10y": 11 },
    benchmark: { "1y": 16, "3y": 13, "5y": 11, "10y": 10 },
    category: { "1y": 15, "3y": 12, "5y": 10, "10y": 9 },
  },
  risk: { sharpe1y: 1.2, stddev1y: 12.5, maxDrawdown1y: -0.18 },
  holdings: [],
  sectorAllocation: [],
  meta: {
    expenseRatioPct: 0.5,
    aumCr: 25000,
    managerName: "A. Manager",
    managerTenureYears: 5,
  },
  peers: [
    { schemeCode: "120001", name: "Peer A", score: 7 },
    { schemeCode: "120002", name: "Peer B", score: 6 },
    { schemeCode: "120003", name: "Peer C", score: 5 },
  ],
  narrative: null,
  disclaimers: { analysis: ANALYSIS_DISCLAIMER },
  dataLineage: [],
};

describe("FundReportsService.getFund", () => {
  it("returns the parsed payload from Redis without touching Mongo", async () => {
    const cache = makeCache();
    vi.mocked(cache.get).mockResolvedValueOnce(baseDoc);
    const model = makeModel();
    const peers = makePeerSet(vi.fn().mockResolvedValue([]));
    const service = new FundReportsService(cache, model, makeConfig(), peers);

    const result = await service.getFund("120000");

    expect(result?.schemeCode).toBe("120000");
    expect(model.findOne).not.toHaveBeenCalled();
    expect(result?.disclaimers.analysis).toBe(ANALYSIS_DISCLAIMER);
    expect(result?.disclaimers.pastPerformance).toBe(PAST_PERF_DISCLAIMER);
  });

  it("attaches the past-performance disclaimer ALWAYS (vs stock report which is conditional)", async () => {
    const cache = makeCache();
    vi.mocked(cache.get).mockResolvedValueOnce({ ...baseDoc, narrative: null });
    const service = new FundReportsService(
      cache,
      makeModel(),
      makeConfig(),
      makePeerSet(vi.fn().mockResolvedValue([])),
    );

    const result = await service.getFund("120000");

    expect(result?.disclaimers.pastPerformance).toBe(PAST_PERF_DISCLAIMER);
  });

  it("falls back to Mongo on cache miss + warms the cache", async () => {
    const cache = makeCache();
    const model = makeModel();
    vi.mocked(model.findOne).mockReturnValueOnce({
      lean: () => ({ exec: () => Promise.resolve(baseDoc) }),
    } as never);
    const service = new FundReportsService(
      cache,
      model,
      makeConfig(),
      makePeerSet(vi.fn().mockResolvedValue([])),
    );

    await service.getFund("120000");

    expect(cache.set).toHaveBeenCalledWith(
      "report:fund:120000",
      expect.objectContaining({ schemeCode: "120000" }),
      24 * 60 * 60,
    );
  });

  it("populates higherScoringPeers when score < 6", async () => {
    const lowDoc: FundReportDoc = {
      ...baseDoc,
      score: { ...baseDoc.score, value: 4, verdict: makeVerdict("WEAK_SCORE") },
    };
    const cache = makeCache();
    vi.mocked(cache.get).mockResolvedValueOnce(lowDoc);
    const higher = vi.fn().mockResolvedValue([
      { schemeCode: "120100", name: "Top Fund", score: 9, scoreDelta: 5 },
    ]);
    const service = new FundReportsService(
      cache,
      makeModel(),
      makeConfig(),
      makePeerSet(higher),
    );

    const result = await service.getFund("120000");

    expect(higher).toHaveBeenCalledWith("120000");
    expect(result?.higherScoringPeers).toHaveLength(1);
  });

  it("omits higherScoringPeers when score >= 6", async () => {
    const cache = makeCache();
    vi.mocked(cache.get).mockResolvedValueOnce(baseDoc);
    const higher = vi.fn().mockResolvedValue([]);
    const service = new FundReportsService(
      cache,
      makeModel(),
      makeConfig(),
      makePeerSet(higher),
    );

    const result = await service.getFund("120000");

    expect(higher).not.toHaveBeenCalled();
    expect(result?.higherScoringPeers).toBeUndefined();
  });

  it("returns null when neither Redis nor Mongo has the doc", async () => {
    const cache = makeCache();
    const model = makeModel();
    vi.mocked(model.findOne).mockReturnValueOnce({
      lean: () => ({ exec: () => Promise.resolve(null) }),
    } as never);
    const service = new FundReportsService(
      cache,
      model,
      makeConfig(),
      makePeerSet(vi.fn().mockResolvedValue([])),
    );

    await expect(service.getFund("999999")).resolves.toBeNull();
  });
});

describe("FundReportsService.bustCache", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("fires the HMAC webhook with the fund-prefixed tag", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const service = new FundReportsService(
      makeCache(),
      makeModel(),
      makeConfig({
        REVALIDATE_HMAC_SECRET: "test-secret-1234567890",
        REVALIDATE_WEBHOOK_URL: "http://localhost:3000",
      }),
      makePeerSet(vi.fn()),
    );

    await service.bustCache("120000");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:3000/api/internal/revalidate");
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      tag: "fund:120000",
    });
  });

  it("does not throw when the webhook fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );
    const service = new FundReportsService(
      makeCache(),
      makeModel(),
      makeConfig({
        REVALIDATE_HMAC_SECRET: "test-secret-1234567890",
        REVALIDATE_WEBHOOK_URL: "http://localhost:3000",
      }),
      makePeerSet(vi.fn()),
    );

    await expect(service.bustCache("120000")).resolves.toBeUndefined();
  });
});

describe("FundReportsService.upsertNarrative", () => {
  it("writes narrative with upsert + bustCache side effect", async () => {
    const cache = makeCache();
    const model = makeModel();
    vi.mocked(model.updateOne).mockReturnValueOnce({
      exec: () => Promise.resolve({ acknowledged: true }),
    } as never);
    const service = new FundReportsService(
      cache,
      model,
      makeConfig(),
      makePeerSet(vi.fn()),
    );
    vi.stubGlobal("fetch", vi.fn());

    await service.upsertNarrative("120000", {
      narrative: {
        paragraph: "FinSight Fund Score: 7. Verdict: Strong Score.",
        citedSources: ["score"],
        generatedAt: new Date().toISOString(),
        auditPassed: true,
      },
      dataVersionHash: "v1",
    });

    expect(model.updateOne).toHaveBeenCalledOnce();
    expect(cache.del).toHaveBeenCalledWith("report:fund:120000");
  });
});
