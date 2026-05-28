import { createHash } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import { InstrumentsRepository } from "./instruments.repository";

export interface DataVersionPatch {
  readonly lastPriceTs?: Date;
  readonly lastFundamentalsTs?: Date;
  readonly lastNewsTs?: Date;
}

/**
 * Cross-phase contract: `dataVersionHash` is sha1 over the tuple
 * `(instrumentId, lastPriceTs, lastFundamentalsTs, lastNewsTs)`. Phase 4
 * uses this as the Gemini narrative cache key so the precomputed text is
 * invalidated only when one of those timestamps actually advances —
 * stable across identical re-runs.
 */
@Injectable()
export class DataVersionHashService {
  constructor(private readonly instruments: InstrumentsRepository) {}

  async bump(instrumentId: string, patch: DataVersionPatch): Promise<string> {
    const doc = await this.instruments.findById(instrumentId);
    if (!doc) {
      throw new NotFoundException(`Instrument ${instrumentId} not found`);
    }
    const next = {
      lastPriceTs: patch.lastPriceTs ?? doc.lastPriceTs,
      lastFundamentalsTs: patch.lastFundamentalsTs ?? doc.lastFundamentalsTs,
      lastNewsTs: patch.lastNewsTs ?? doc.lastNewsTs,
    };
    const hash = DataVersionHashService.compute(instrumentId, next);
    await this.instruments.updateFields(instrumentId, {
      ...next,
      dataVersionHash: hash,
    });
    return hash;
  }

  static compute(
    instrumentId: string,
    fields: DataVersionPatch,
  ): string {
    const payload = JSON.stringify({
      id: instrumentId,
      p: fields.lastPriceTs?.toISOString() ?? "",
      f: fields.lastFundamentalsTs?.toISOString() ?? "",
      n: fields.lastNewsTs?.toISOString() ?? "",
    });
    return createHash("sha1").update(payload).digest("hex");
  }
}
