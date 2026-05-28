import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import { Types } from "mongoose";
import type { EodRecomputeProducer } from "./eod-recompute.producer";
import { EodRecomputeProcessor } from "./eod-recompute.processor";
import {
  EOD_CHILD_JOB_NAME,
  EOD_PARENT_JOB_NAME,
  type EodChildPayload,
} from "./eod-recompute.types";
import type { RedisScoreMaterialiser } from "./redis-score-materialiser";
import type { ScoreHistoryRepository } from "./score-history.repository";
import type {
  FundsScoreLoader,
  StocksScoreLoader,
} from "./score-loaders";
import type { ScoringEngineVersionProvider } from "./scoring-engine-version.provider";

const stockInputFixture = {
  instrumentId: "i-1",
  asOfDate: "2026-05-27",
  fundamentals: {
    roeTtm: 18,
    roceTtm: 22,
    debtToEquity: 0.4,
    revenueCagr3y: 14,
    profitCagr3y: 16,
    opMarginTtm: 17,
  },
  shareholding: {
    promoterPct: 50,
    pledgedPctOfPromoter: 0,
    pledgedPctTrend90d: 0,
  },
  valuation: { peTtm: 25, pb: 4, peg: 1.5, evEbitda: 14, divYield: 1.2 },
  sectorMedians: { pe: 22 },
  technical: {
    price: 2500,
    sma50: 2400,
    sma200: 2200,
    rsi14: 55,
    macd: { macd: 1.2, signal: 0.8 },
    bollinger: { upper: 2600, lower: 2350 },
    return1yVsNifty: 0.05,
    return3yVsNifty: 0.1,
    beta: 1.0,
  },
  sentiment: { last30dAggregate: 7, analystConsensus: 6.5 },
  risk: {
    volatility1yAnnualised: 0.22,
    maxDrawdown1y: -0.18,
    earningsConsistencyPct: 80,
    auditQualifications: 0,
  },
  event: {
    meanAbsReturnResults5: 1.5,
    meanAbsReturnDividends5: 0.8,
    meanAbsReturnSectorNews5: 1.2,
  },
  peerCohort: {},
  _inputHash: "",
};

function makeJob(name: string, data: unknown): Job {
  return { name, data } as unknown as Job;
}

interface ProcessorDeps {
  stocksLoader: StocksScoreLoader;
  fundsLoader: FundsScoreLoader;
  history: ScoreHistoryRepository;
  redis: RedisScoreMaterialiser;
  version: ScoringEngineVersionProvider;
  producer: EodRecomputeProducer;
}

function makeDeps(overrides: Partial<ProcessorDeps> = {}): ProcessorDeps {
  return {
    stocksLoader: {
      loadScoreInput: vi.fn().mockResolvedValue(stockInputFixture),
    } as unknown as StocksScoreLoader,
    fundsLoader: {
      loadScoreInput: vi.fn(),
    } as unknown as FundsScoreLoader,
    history: {
      insert: vi.fn().mockResolvedValue(undefined),
    } as unknown as ScoreHistoryRepository,
    redis: {
      writeScore: vi.fn().mockResolvedValue(undefined),
    } as unknown as RedisScoreMaterialiser,
    version: {
      current: vi.fn().mockReturnValue("0.1.0"),
    } as unknown as ScoringEngineVersionProvider,
    producer: {
      fanOut: vi.fn().mockResolvedValue({ enqueued: 10, chunks: 1 }),
    } as unknown as EodRecomputeProducer,
    ...overrides,
  };
}

describe("EodRecomputeProcessor — child job", () => {
  let deps: ProcessorDeps;
  let processor: EodRecomputeProcessor;
  const instrumentId = new Types.ObjectId().toHexString();

  beforeEach(() => {
    deps = makeDeps();
    processor = new EodRecomputeProcessor(
      deps.stocksLoader,
      deps.fundsLoader,
      deps.history,
      deps.redis,
      deps.version,
      deps.producer,
    );
  });

  it("calls scoreStock, writes Mongo, then writes Redis (in that order)", async () => {
    const payload: EodChildPayload = {
      instrumentId,
      instrumentType: "STOCK",
      asOfDate: "2026-05-27",
      triggeredBy: "cron",
    };
    const order: string[] = [];
    vi.mocked(deps.history.insert).mockImplementation(async () => {
      order.push("history.insert");
    });
    vi.mocked(deps.redis.writeScore).mockImplementation(async () => {
      order.push("redis.writeScore");
    });

    await processor.process(makeJob(EOD_CHILD_JOB_NAME, payload));

    expect(deps.stocksLoader.loadScoreInput).toHaveBeenCalledWith(
      instrumentId,
      "2026-05-27",
    );
    expect(order).toEqual(["history.insert", "redis.writeScore"]);
    const historyCall = vi.mocked(deps.history.insert).mock.calls[0][0];
    expect(historyCall.instrumentType).toBe("STOCK");
    expect(historyCall.scoringEngineVersion).toBe("0.1.0");
    expect(typeof historyCall.score).toBe("number");
  });

  it("does not call Redis if Mongo insert fails", async () => {
    const payload: EodChildPayload = {
      instrumentId,
      instrumentType: "STOCK",
      asOfDate: "2026-05-27",
      triggeredBy: "cron",
    };
    vi.mocked(deps.history.insert).mockRejectedValue(new Error("mongo down"));

    await expect(
      processor.process(makeJob(EOD_CHILD_JOB_NAME, payload)),
    ).rejects.toThrow("mongo down");
    expect(deps.redis.writeScore).not.toHaveBeenCalled();
  });

  it("dispatches the parent job to fanOut", async () => {
    await processor.process(
      makeJob(EOD_PARENT_JOB_NAME, { asOfDate: "2026-05-28", triggeredBy: "cron" }),
    );

    expect(deps.producer.fanOut).toHaveBeenCalledWith("2026-05-28", "cron");
  });

  it("uses today's IST date when the parent payload omits asOfDate", async () => {
    await processor.process(makeJob(EOD_PARENT_JOB_NAME, {}));

    expect(deps.producer.fanOut).toHaveBeenCalledOnce();
    const arg = vi.mocked(deps.producer.fanOut).mock.calls[0]?.[0] as string;
    expect(arg).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
