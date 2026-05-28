import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import type { Model } from "mongoose";
import { makeVerdict, type StockReportDoc } from "@finsight/shared";
import {
  ANALYSIS_DISCLAIMER,
  PAST_PERF_DISCLAIMER,
} from "../compliance/disclaimers.constants";
import type { CacheService } from "../modules/cache/cache.service";
import {
  ReportsService,
  type UpsertNarrativePayload,
} from "./reports.service";
import type { StockReportDocDocument } from "./schemas/stock-report-doc.schema";

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
  } as unknown as Model<StockReportDocDocument>;
}

function makeConfig(overrides: Record<string, string | undefined> = {}) {
  return {
    get: vi.fn((key: string) => overrides[key]),
  } as unknown as ConfigService;
}

const sampleDoc: StockReportDoc = {
  ticker: "RELIANCE",
  name: "Reliance Industries Limited",
  sector: "Energy",
  asOf: "2026-05-27T12:30:00.000Z",
  dataVersionHash: "abc",
  score: {
    value: 7,
    verdict: makeVerdict("CAUTION"),
    pillars: {
      fundamentals: 7,
      valuation: 6,
      technical: 7,
      sentiment: 5,
      risk: 6,
      event: 7,
    },
    weightsVersion: "0.1.0",
  },
  fundamentals: {
    pe: 25,
    pb: 4,
    roe: 18,
    roce: 22,
    debtEquity: 0.4,
    marketCap: 1_500_000,
  },
  technicals: {
    rsi14: 55,
    macdSignal: "bullish",
    dma50: 2400,
    dma200: 2200,
    price: 2500,
    beta: 1,
  },
  insights: {
    volatility: { stddev1y: 0.22 },
    profitConsistency: { profitableQuartersPct: 80, window: "12Q" },
    eventSensitivity: { avgAbsReturnOnResultDay: 1.5, baseline: 1 },
    swot: {
      strengths: [],
      weaknesses: [],
      opportunities: [],
      threats: [],
      citedSources: [],
    },
    promoterHoldings: { latestPct: 50, deltaPctVsPrevQ: 0 },
  },
  peers: [
    { ticker: "ONGC", name: "ONGC", score: 6 },
    { ticker: "IOC", name: "Indian Oil", score: 5 },
    { ticker: "BPCL", name: "BPCL", score: 5 },
  ],
  narrative: null,
  disclaimers: { analysis: ANALYSIS_DISCLAIMER },
  dataLineage: [],
};

describe("ReportsService.getStock", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns the parsed payload from Redis without touching Mongo", async () => {
    const cache = makeCache();
    vi.mocked(cache.get).mockResolvedValueOnce(sampleDoc);
    const model = makeModel();
    const config = makeConfig();
    const service = new ReportsService(cache, model, config);

    const result = await service.getStock("RELIANCE");

    expect(result).toBeDefined();
    expect(result?.ticker).toBe("RELIANCE");
    expect(model.findOne).not.toHaveBeenCalled();
    expect(result?.disclaimers.analysis).toBe(ANALYSIS_DISCLAIMER);
    expect(result?.disclaimers.pastPerformance).toBeUndefined();
  });

  it("falls back to Mongo on cache miss and re-warms the cache", async () => {
    const cache = makeCache();
    vi.mocked(cache.get).mockResolvedValueOnce(null);
    const model = makeModel();
    vi.mocked(model.findOne).mockReturnValueOnce({
      lean: () => ({ exec: () => Promise.resolve(sampleDoc) }),
    } as never);
    const config = makeConfig();
    const service = new ReportsService(cache, model, config);

    const result = await service.getStock("RELIANCE");

    expect(result?.ticker).toBe("RELIANCE");
    expect(cache.set).toHaveBeenCalledWith(
      "report:stock:RELIANCE",
      expect.objectContaining({ ticker: "RELIANCE" }),
      24 * 60 * 60,
    );
  });

  it("returns null when neither Redis nor Mongo has the doc", async () => {
    const cache = makeCache();
    const model = makeModel();
    vi.mocked(model.findOne).mockReturnValueOnce({
      lean: () => ({ exec: () => Promise.resolve(null) }),
    } as never);
    const config = makeConfig();
    const service = new ReportsService(cache, model, config);

    await expect(service.getStock("UNKNOWN")).resolves.toBeNull();
  });

  it("attaches the past-performance disclaimer when a narrative is present", async () => {
    const docWithNarrative: StockReportDoc = {
      ...sampleDoc,
      narrative: {
        paragraph: "FinSight Score: 7. Verdict: Caution.",
        citedSources: ["score"],
        generatedAt: new Date().toISOString(),
        auditPassed: true,
      },
    };
    const cache = makeCache();
    vi.mocked(cache.get).mockResolvedValueOnce(docWithNarrative);
    const service = new ReportsService(cache, makeModel(), makeConfig());

    const result = await service.getStock("RELIANCE");

    expect(result?.disclaimers.pastPerformance).toBe(PAST_PERF_DISCLAIMER);
  });
});

describe("ReportsService.upsertNarrative", () => {
  it("calls model.updateOne with upsert + bustCache side effect", async () => {
    const cache = makeCache();
    const model = makeModel();
    vi.mocked(model.updateOne).mockReturnValueOnce({
      exec: () => Promise.resolve({ acknowledged: true }),
    } as never);
    const config = makeConfig();
    const service = new ReportsService(cache, model, config);
    vi.stubGlobal("fetch", vi.fn());

    const payload: UpsertNarrativePayload = {
      narrative: {
        paragraph: "FinSight Score: 7. Verdict: Caution.",
        citedSources: ["score"],
        generatedAt: new Date().toISOString(),
        auditPassed: true,
      },
      swot: {
        strengths: ["a"],
        weaknesses: [],
        opportunities: [],
        threats: [],
        citedSources: [],
        generatedAt: new Date().toISOString(),
        auditPassed: true,
      },
      dataVersionHash: "v1",
    };

    await service.upsertNarrative("RELIANCE", payload);

    expect(model.updateOne).toHaveBeenCalledOnce();
    const [filter, update, opts] = vi
      .mocked(model.updateOne)
      .mock.calls[0] as unknown as [
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(filter).toEqual({ ticker: "RELIANCE" });
    expect(opts).toEqual({ upsert: true });
    expect((update as { $set?: Record<string, unknown> }).$set?.dataVersionHash).toBe(
      "v1",
    );
    expect(cache.del).toHaveBeenCalledWith("report:stock:RELIANCE");
  });
});

describe("ReportsService.bustCache", () => {
  it("fires the HMAC-signed revalidate webhook when env is configured", async () => {
    const cache = makeCache();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const config = makeConfig({
      REVALIDATE_HMAC_SECRET: "test-secret-1234567890",
      REVALIDATE_WEBHOOK_URL: "http://localhost:3000",
    });
    const service = new ReportsService(cache, makeModel(), config);

    await service.bustCache("RELIANCE");

    expect(cache.del).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:3000/api/internal/revalidate");
    expect((init as { headers: Record<string, string> }).headers["x-revalidate-hmac"])
      .toMatch(/^[a-f0-9]{64}$/);
  });

  it("logs but does NOT throw when the revalidate webhook fails", async () => {
    const cache = makeCache();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const config = makeConfig({
      REVALIDATE_HMAC_SECRET: "test-secret-1234567890",
      REVALIDATE_WEBHOOK_URL: "http://localhost:3000",
    });
    const service = new ReportsService(cache, makeModel(), config);

    await expect(service.bustCache("RELIANCE")).resolves.toBeUndefined();
  });

  it("skips the webhook (logs warn) when env vars are missing", async () => {
    const cache = makeCache();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const service = new ReportsService(cache, makeModel(), makeConfig());

    await service.bustCache("RELIANCE");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
