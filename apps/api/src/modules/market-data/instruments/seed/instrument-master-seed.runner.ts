import { Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { type AxiosInstance } from "axios";
import { AmfiAdapter } from "../../amfi.adapter";
import { FundsRepository } from "../funds.repository";
import { InstrumentsRepository } from "../instruments.repository";
import { AmfiSchemeMasterSeed } from "./amfi-scheme-master.seed";
import { NseBhavcopySeed } from "./nse-bhavcopy.seed";

export interface SeedRunResult {
  readonly instrumentsAffected: number;
  readonly fundsAffected: number;
}

/**
 * Monthly seed orchestrator. Pulls the latest NSE bhav copy + AMFI
 * scheme list and upserts the canonical instrument + fund masters.
 *
 * `bhavcopyUrl` can be overridden via the `NSE_BHAVCOPY_URL` env var so
 * tests inject a local fixture URL (and the production cron uses the
 * NSE archives endpoint).
 *
 * Wraps no BullMQ machinery directly — a future Plan 02-03b will wrap
 * this in a `@Processor('instrument-master-seed')` once Redis is
 * provisioned. Until then the runner is callable by hand or from any
 * other scheduler.
 */
@Injectable()
export class InstrumentMasterSeedRunner {
  private readonly logger = new Logger(InstrumentMasterSeedRunner.name);
  private readonly http: AxiosInstance;

  constructor(
    private readonly config: ConfigService,
    private readonly bhavcopySeed: NseBhavcopySeed,
    private readonly amfiSeed: AmfiSchemeMasterSeed,
    private readonly amfiAdapter: AmfiAdapter,
    private readonly instruments: InstrumentsRepository,
    private readonly funds: FundsRepository,
    @Optional() http?: AxiosInstance,
  ) {
    this.http =
      http ??
      axios.create({
        timeout: 30_000,
        headers: { "User-Agent": "finsight-api/1.0" },
      });
  }

  async run(): Promise<SeedRunResult> {
    const startedAt = Date.now();
    const [instrumentsAffected, fundsAffected] = await Promise.all([
      this.seedInstruments(),
      this.seedFunds(),
    ]);
    this.logger.log(
      {
        instrumentsAffected,
        fundsAffected,
        elapsedMs: Date.now() - startedAt,
      },
      "instrument_master_seed_complete",
    );
    return { instrumentsAffected, fundsAffected };
  }

  private async seedInstruments(): Promise<number> {
    const url = this.config.get<string>("NSE_BHAVCOPY_URL");
    if (!url) {
      this.logger.warn(
        { provider: "nse-bhavcopy" },
        "nse_bhavcopy_url_not_configured",
      );
      return 0;
    }
    const response = await this.http.get<string>(url, {
      responseType: "text",
    });
    const seeds = this.bhavcopySeed.parse(response.data);
    return this.instruments.bulkUpsert(seeds);
  }

  private async seedFunds(): Promise<number> {
    const result = await this.amfiAdapter.listSchemes();
    if (result.status === "err") {
      this.logger.warn(
        { provider: "amfi", reason: result.reason },
        "amfi_list_schemes_failed",
      );
      return 0;
    }
    if (result.status !== "ok") {
      this.logger.warn(
        { provider: "amfi", status: result.status },
        "amfi_list_schemes_skipped_stale",
      );
      return 0;
    }
    const seeds = this.amfiSeed.fromSchemeMasters(result.data);
    return this.funds.bulkUpsert(seeds);
  }
}
