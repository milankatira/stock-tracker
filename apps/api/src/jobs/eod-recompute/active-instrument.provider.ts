import { Injectable } from "@nestjs/common";
import { InstrumentsRepository } from "../../modules/market-data/instruments/instruments.repository";
import type { ActiveInstrument } from "./eod-recompute.types";

/**
 * Thin adapter that reads the active universe from the Plan 02-03
 * instrument master. Funds will land once the fund repo exposes its
 * own active list (Phase 4 hook).
 */
@Injectable()
export class ActiveInstrumentProvider {
  constructor(private readonly instruments: InstrumentsRepository) {}

  async activeUniverse(_asOfDate: string): Promise<readonly ActiveInstrument[]> {
    const stocks = await this.instruments.listActiveTickers();
    return stocks.map((doc) => ({
      id: doc._id.toString(),
      type: "STOCK" as const,
    }));
  }
}
