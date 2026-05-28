import { Inject, Injectable, Logger } from "@nestjs/common";
import type { OHLCVBar } from "@finsight/shared";
import { CORPORATE_ACTIONS_PROVIDER } from "@finsight/shared";
import type {
  CorporateAction,
  NseAdapter,
} from "../nse.adapter";
import {
  PriceHistoryRepository,
  type PersistedBarInput,
} from "./price-history.repository";

const LOW_THRESHOLD = 0.9;
const HIGH_THRESHOLD = 1.1;

export interface AdjustmentSummary {
  readonly persisted: number;
  readonly splitFactors: ReadonlyArray<{
    readonly ts: Date;
    readonly factor: number;
  }>;
}

/**
 * Persists OHLCV bars with the always-adjusted invariant + an optional
 * back-adjustment pass for corporate actions Yahoo has not yet reflected.
 *
 * Decision logic (RESEARCH.md Pattern 5):
 *  1. For each bar pair where `rawClose / prevRawClose` falls outside
 *     [0.9, 1.1], query the NSE corporate-actions feed for the window.
 *  2. If a SPLIT or BONUS action is reported on or near that date, the
 *     factor is `rawClose / prevRawClose` and we back-adjust prior bars'
 *     `close` by multiplying with the factor. DIVIDEND actions are
 *     ignored — Yahoo's `adjClose` already incorporates dividends.
 *  3. If no matching corporate action is found, the move is left as-is
 *     (it's a real ~10% market day, not a corp-action artifact).
 *
 * The persisted bars always carry `close` = corp-action-adjusted, with
 * `rawClose` retained for audit.
 */
@Injectable()
export class AdjustmentService {
  private readonly logger = new Logger(AdjustmentService.name);

  constructor(
    private readonly repository: PriceHistoryRepository,
    @Inject(CORPORATE_ACTIONS_PROVIDER)
    private readonly corporateActions: Pick<NseAdapter, "getCorporateActions">,
  ) {}

  async applyAndPersist(
    instrumentId: string,
    yahooSymbol: string,
    source: string,
    bars: readonly OHLCVBar[],
  ): Promise<AdjustmentSummary> {
    if (bars.length === 0) {
      return { persisted: 0, splitFactors: [] };
    }
    const ordered = [...bars].sort(
      (a, b) => a.ts.getTime() - b.ts.getTime(),
    );

    const candidates = this.detectCorpActionCandidates(ordered);
    const splitFactors = candidates.length
      ? await this.confirmSplitsAndBonuses(yahooSymbol, candidates)
      : [];
    const adjustedBars = this.backAdjust(ordered, splitFactors);

    const inputs: PersistedBarInput[] = adjustedBars.map((bar) => ({
      ...bar,
      instrumentId,
      source,
    }));
    const persisted = await this.repository.insertMany(inputs);

    if (splitFactors.length > 0) {
      this.logger.log(
        {
          instrumentId,
          yahooSymbol,
          splits: splitFactors.length,
        },
        "price_history_back_adjusted",
      );
    }

    return { persisted, splitFactors };
  }

  private detectCorpActionCandidates(
    bars: readonly OHLCVBar[],
  ): ReadonlyArray<{ index: number; ts: Date; factor: number }> {
    const candidates: { index: number; ts: Date; factor: number }[] = [];
    for (let i = 1; i < bars.length; i += 1) {
      const prev = bars[i - 1];
      const current = bars[i];
      if (prev.rawClose <= 0) continue;
      const ratio = current.rawClose / prev.rawClose;
      if (ratio < LOW_THRESHOLD || ratio > HIGH_THRESHOLD) {
        candidates.push({ index: i, ts: current.ts, factor: ratio });
      }
    }
    return candidates;
  }

  private async confirmSplitsAndBonuses(
    yahooSymbol: string,
    candidates: ReadonlyArray<{ index: number; ts: Date; factor: number }>,
  ): Promise<ReadonlyArray<{ index: number; factor: number; ts: Date }>> {
    const earliest = candidates[0].ts;
    const latest = candidates[candidates.length - 1].ts;
    const result = await this.corporateActions.getCorporateActions(
      yahooSymbol,
      new Date(earliest.getTime() - 3 * 24 * 60 * 60 * 1000),
      new Date(latest.getTime() + 3 * 24 * 60 * 60 * 1000),
    );
    if (result.status !== "ok") return [];

    const actionsByDay = new Map<string, CorporateAction[]>();
    for (const action of result.data) {
      if (action.type !== "SPLIT" && action.type !== "BONUS") continue;
      const key = action.exDate.toISOString().slice(0, 10);
      const bucket = actionsByDay.get(key) ?? [];
      bucket.push(action);
      actionsByDay.set(key, bucket);
    }

    const confirmed: { index: number; factor: number; ts: Date }[] = [];
    for (const candidate of candidates) {
      const candidateKey = candidate.ts.toISOString().slice(0, 10);
      if (actionsByDay.has(candidateKey)) {
        confirmed.push({
          index: candidate.index,
          factor: candidate.factor,
          ts: candidate.ts,
        });
      }
    }
    return confirmed;
  }

  private backAdjust(
    bars: readonly OHLCVBar[],
    confirmed: ReadonlyArray<{ index: number; factor: number; ts: Date }>,
  ): readonly OHLCVBar[] {
    if (confirmed.length === 0) return bars;
    const adjusted: OHLCVBar[] = bars.map((bar) => ({ ...bar }));
    for (const { index, factor } of confirmed) {
      for (let j = 0; j < index; j += 1) {
        adjusted[j] = {
          ...adjusted[j],
          close: adjusted[j].close * factor,
          open: adjusted[j].open * factor,
          high: adjusted[j].high * factor,
          low: adjusted[j].low * factor,
        };
      }
    }
    return adjusted;
  }
}
