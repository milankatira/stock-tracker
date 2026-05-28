import { Injectable, Logger } from "@nestjs/common";
import type {
  FundProvider,
  NavPoint,
  NavSnapshot,
  ProviderResult,
  SchemeMaster,
} from "@finsight/shared";
import { AmfiAdapter } from "../amfi.adapter";
import { MfapiAdapter } from "../mfapi.adapter";
import { StaleCacheService } from "../stale-cache/stale-cache.service";
import { CHAIN_STALE_TTL_SECONDS } from "./chain.types";

const SOURCE = "fund-chain";

@Injectable()
export class FundChainService implements FundProvider {
  private readonly logger = new Logger(FundChainService.name);

  constructor(
    private readonly mfapi: MfapiAdapter,
    private readonly amfi: AmfiAdapter,
    private readonly staleCache: StaleCacheService,
  ) {}

  async getLatestNav(
    schemeCode: string,
  ): Promise<ProviderResult<NavSnapshot>> {
    const cacheKey = `nav:${schemeCode}`;
    const primary = await this.runAdapter("mfapi.latest", () =>
      this.mfapi.getLatestNav(schemeCode),
    );
    if (primary?.status === "ok") {
      await this.writeStale(cacheKey, primary.data, CHAIN_STALE_TTL_SECONDS.NAV_SNAPSHOT);
      return primary;
    }

    const fallback = await this.runAdapter("amfi.latest", () =>
      this.amfi.getLatestNav(schemeCode),
    );
    if (fallback?.status === "ok") {
      await this.writeStale(cacheKey, fallback.data, CHAIN_STALE_TTL_SECONDS.NAV_SNAPSHOT);
      return fallback;
    }

    return this.readStale<NavSnapshot>(cacheKey, "mfapi.in");
  }

  async getNavHistory(
    schemeCode: string,
  ): Promise<ProviderResult<NavPoint[]>> {
    const cacheKey = `nav-history:${schemeCode}`;
    const primary = await this.runAdapter("mfapi.history", () =>
      this.mfapi.getNavHistory(schemeCode),
    );
    if (primary?.status === "ok") {
      await this.writeStale(cacheKey, primary.data, CHAIN_STALE_TTL_SECONDS.NAV_HISTORY);
      return primary;
    }
    // AMFI snapshot has no history — skip directly to stale-cache.
    return this.readStale<NavPoint[]>(cacheKey, "mfapi.in");
  }

  async listSchemes(): Promise<ProviderResult<SchemeMaster[]>> {
    const cacheKey = `schemes:all`;
    const primary = await this.runAdapter("amfi.listSchemes", () =>
      this.amfi.listSchemes(),
    );
    if (primary?.status === "ok") {
      await this.writeStale(cacheKey, primary.data, CHAIN_STALE_TTL_SECONDS.SCHEME_LIST);
      return primary;
    }

    const fallback = await this.runAdapter("mfapi.listSchemes", () =>
      this.mfapi.listSchemes(),
    );
    if (fallback?.status === "ok") {
      await this.writeStale(cacheKey, fallback.data, CHAIN_STALE_TTL_SECONDS.SCHEME_LIST);
      return fallback;
    }

    return this.readStale<SchemeMaster[]>(cacheKey, "amfi");
  }

  private async runAdapter<T>(
    label: string,
    fn: () => Promise<ProviderResult<T>>,
  ): Promise<ProviderResult<T> | null> {
    try {
      return await fn();
    } catch (err) {
      this.logger.warn(
        { adapter: label, message: this.errorMessage(err) },
        "fund_chain_adapter_threw",
      );
      return null;
    }
  }

  private async writeStale<T>(
    key: string,
    value: T,
    ttlSeconds: number,
  ): Promise<void> {
    try {
      await this.staleCache.write(key, value, ttlSeconds);
    } catch (err) {
      this.logger.warn(
        { key, message: this.errorMessage(err) },
        "fund_chain_stale_write_failed",
      );
    }
  }

  private async readStale<T>(
    key: string,
    source: string,
  ): Promise<ProviderResult<T>> {
    const cached = await this.staleCache.read<T>(key);
    if (cached) {
      return {
        status: "stale",
        source,
        fetchedAt: new Date(),
        stalenessSeconds: cached.stalenessSeconds,
        data: cached.value,
      };
    }
    return {
      status: "err",
      reason: "unknown",
      message: "all providers failed and stale-cache miss",
      source: SOURCE,
    };
  }

  private errorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    return "unknown chain error";
  }
}
