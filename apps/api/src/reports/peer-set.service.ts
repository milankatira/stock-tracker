import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import type { Peer } from "@finsight/shared";
import { InstrumentsRepository } from "../modules/market-data/instruments/instruments.repository";
import { REDIS_CLIENT } from "../modules/cache/cache.constants";
import type { RedisCacheClient } from "../modules/cache/cache.service";
import {
  StockReportDocEntity,
  type StockReportDocDocument,
} from "./schemas/stock-report-doc.schema";

const PEER_CACHE_TTL_SECONDS = 24 * 60 * 60;
const PEER_COUNT = 3;

interface CachedPeerEntry {
  readonly value: Peer[];
}

/**
 * Peer-set fallback. Prefers the precomputed `peers` array on the
 * StockReportDoc (populated by the EOD job); falls back to a
 * sector + log-scale market-cap proximity search over the Phase 2
 * instrument master. Computed peers are Redis-cached for 24h so
 * repeat lookups never re-pay the Mongo scan.
 */
@Injectable()
export class PeerSetService {
  private readonly logger = new Logger(PeerSetService.name);

  constructor(
    @InjectModel(StockReportDocEntity.name)
    private readonly reports: Model<StockReportDocDocument>,
    private readonly instruments: InstrumentsRepository,
    @Inject(REDIS_CLIENT) private readonly redis: RedisCacheClient,
  ) {}

  async getPeers(ticker: string): Promise<readonly Peer[]> {
    const existing = await this.reports
      .findOne({ ticker })
      .select("peers")
      .lean()
      .exec();
    if (existing?.peers && existing.peers.length === PEER_COUNT) {
      return existing.peers as unknown as Peer[];
    }

    const cacheKey = this.cacheKey(ticker);
    const cached = await this.readCache(cacheKey);
    if (cached) return cached;

    const computed = await this.computeFromInstrumentMaster(ticker);
    if (computed.length > 0) {
      await this.writeCache(cacheKey, computed);
    }
    return computed;
  }

  private async computeFromInstrumentMaster(
    ticker: string,
  ): Promise<readonly Peer[]> {
    const subject = await this.instruments.findByNseSymbol(ticker);
    if (!subject) return [];

    const universe = await this.instruments.listActiveTickers();
    if (universe.length === 0) return [];

    const sameSector = universe.filter(
      (candidate) =>
        candidate.nseSymbol !== ticker &&
        (candidate.sector ?? "") === (subject.sector ?? ""),
    );
    const pool = sameSector.length > 0 ? sameSector : universe;

    const subjectCap = subject.popularity || 1;
    const scored = pool
      .map((candidate) => ({
        candidate,
        distance: Math.abs(
          Math.log(Math.max(candidate.popularity || 1, 1)) -
            Math.log(subjectCap),
        ),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, PEER_COUNT);

    if (scored.length < PEER_COUNT) {
      this.logger.warn(
        {
          ticker,
          sector: subject.sector,
          available: scored.length,
          required: PEER_COUNT,
        },
        "peer_set_short_pool",
      );
    }

    return scored.map((entry) => ({
      ticker: entry.candidate.nseSymbol,
      name: entry.candidate.name,
      score: 0,
      sector: entry.candidate.sector,
    }));
  }

  private cacheKey(ticker: string): string {
    return `peers:${ticker}`;
  }

  private async readCache(key: string): Promise<Peer[] | null> {
    const raw = await this.redis.get(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as CachedPeerEntry;
      if (parsed && Array.isArray(parsed.value)) return parsed.value;
      return null;
    } catch {
      return null;
    }
  }

  private async writeCache(key: string, value: readonly Peer[]): Promise<void> {
    const envelope: CachedPeerEntry = { value: [...value] };
    await this.redis.set(
      key,
      JSON.stringify(envelope),
      "EX",
      PEER_CACHE_TTL_SECONDS,
    );
  }
}
