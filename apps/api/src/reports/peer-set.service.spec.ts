import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Model } from "mongoose";
import type { InstrumentsRepository } from "../modules/market-data/instruments/instruments.repository";
import type { RedisCacheClient } from "../modules/cache/cache.service";
import { PeerSetService } from "./peer-set.service";
import type { StockReportDocDocument } from "./schemas/stock-report-doc.schema";

function makeReports(existingPeers: unknown[] | null) {
  return {
    findOne: vi.fn().mockReturnValue({
      select: () => ({
        lean: () => ({
          exec: () =>
            Promise.resolve(
              existingPeers === null ? null : { peers: existingPeers },
            ),
        }),
      }),
    }),
  } as unknown as Model<StockReportDocDocument>;
}

function makeInstruments(
  subject: { nseSymbol: string; sector?: string; popularity: number; name: string } | null,
  universe: Array<{
    nseSymbol: string;
    sector?: string;
    popularity: number;
    name: string;
  }>,
): InstrumentsRepository {
  return {
    findByNseSymbol: vi.fn(async (symbol: string) =>
      subject && subject.nseSymbol === symbol ? subject : null,
    ),
    listActiveTickers: vi.fn(async () => universe),
  } as unknown as InstrumentsRepository;
}

function makeRedis(): RedisCacheClient {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
    incr: vi.fn(),
    pexpire: vi.fn(),
    pttl: vi.fn(),
    ping: vi.fn(),
    quit: vi.fn(),
  } as unknown as RedisCacheClient;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("PeerSetService.getPeers", () => {
  it("returns the precomputed peers from the report doc when available", async () => {
    const reports = makeReports([
      { ticker: "ONGC", name: "ONGC", score: 6 },
      { ticker: "IOC", name: "Indian Oil", score: 5 },
      { ticker: "BPCL", name: "BPCL", score: 5 },
    ]);
    const service = new PeerSetService(
      reports,
      makeInstruments(null, []),
      makeRedis(),
    );

    const result = await service.getPeers("RELIANCE");
    expect(result.map((p) => p.ticker)).toEqual(["ONGC", "IOC", "BPCL"]);
  });

  it("falls back to instrument-master sector + market-cap proximity", async () => {
    const reports = makeReports(null);
    const universe = [
      { nseSymbol: "RELIANCE", sector: "Energy", popularity: 1500000, name: "Reliance" },
      { nseSymbol: "ONGC", sector: "Energy", popularity: 200000, name: "ONGC" },
      { nseSymbol: "IOC", sector: "Energy", popularity: 150000, name: "Indian Oil" },
      { nseSymbol: "BPCL", sector: "Energy", popularity: 100000, name: "BPCL" },
      { nseSymbol: "INFY", sector: "IT", popularity: 700000, name: "Infosys" },
    ];
    const subject = universe[0];
    const service = new PeerSetService(
      reports,
      makeInstruments(subject, universe),
      makeRedis(),
    );

    const result = await service.getPeers("RELIANCE");
    expect(result).toHaveLength(3);
    expect(result.every((p) => p.sector === "Energy")).toBe(true);
    expect(result.map((p) => p.ticker)).not.toContain("INFY");
  });

  it("caches the computed peers in Redis", async () => {
    const reports = makeReports(null);
    const universe = [
      { nseSymbol: "RELIANCE", sector: "Energy", popularity: 1500000, name: "Reliance" },
      { nseSymbol: "ONGC", sector: "Energy", popularity: 200000, name: "ONGC" },
      { nseSymbol: "IOC", sector: "Energy", popularity: 150000, name: "Indian Oil" },
      { nseSymbol: "BPCL", sector: "Energy", popularity: 100000, name: "BPCL" },
    ];
    const redis = makeRedis();
    const service = new PeerSetService(
      reports,
      makeInstruments(universe[0], universe),
      redis,
    );

    await service.getPeers("RELIANCE");

    expect(redis.set).toHaveBeenCalledWith(
      "peers:RELIANCE",
      expect.stringContaining("ONGC"),
      "EX",
      24 * 60 * 60,
    );
  });

  it("returns an empty list when the subject ticker is not found", async () => {
    const reports = makeReports(null);
    const service = new PeerSetService(
      reports,
      makeInstruments(null, []),
      makeRedis(),
    );

    await expect(service.getPeers("UNKNOWN")).resolves.toEqual([]);
  });
});
