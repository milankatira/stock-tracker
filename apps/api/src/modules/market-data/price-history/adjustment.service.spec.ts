import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { MongooseModule, getModelToken } from "@nestjs/mongoose";
import { Test, type TestingModule } from "@nestjs/testing";
import type { Model } from "mongoose";
import type { OHLCVBar, ProviderResult } from "@finsight/shared";
import { CORPORATE_ACTIONS_PROVIDER } from "@finsight/shared";
import { ensureMongo } from "../../../../test/setup";
import type {
  CorporateAction,
  NseAdapter,
} from "../nse.adapter";
import mrfSplitFixture from "../../../../test/fixtures/mrf-split-history.json";
import { AdjustmentService } from "./adjustment.service";
import {
  PriceHistory,
  PriceHistorySchema,
  type PriceHistoryDocument,
} from "./price-history.schema";
import { PriceHistoryRepository } from "./price-history.repository";

function hydrateBars(): readonly OHLCVBar[] {
  return mrfSplitFixture.bars.map((bar) => ({
    ts: new Date(bar.ts),
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    rawClose: bar.rawClose,
    volume: bar.volume,
  }));
}

function makeCorpActionsProvider(
  result: ProviderResult<readonly CorporateAction[]>,
): Pick<NseAdapter, "getCorporateActions"> {
  return {
    getCorporateActions: vi.fn().mockResolvedValue(result),
  };
}

describe("AdjustmentService", () => {
  let moduleRef: TestingModule;
  let service: AdjustmentService;
  let repo: PriceHistoryRepository;
  let model: Model<PriceHistoryDocument>;
  let corpActions: Pick<NseAdapter, "getCorporateActions">;

  beforeAll(async () => {
    const uri = await ensureMongo();
    corpActions = makeCorpActionsProvider({
      status: "ok",
      source: "stock-nse-india",
      fetchedAt: new Date(),
      data: [
        {
          ticker: "MRF",
          exDate: new Date("2026-05-19T00:00:00.000Z"),
          type: "SPLIT",
          ratio: "1:5",
          rawPurpose: "Face Value Split - From Rs. 10 to Rs. 2",
        },
      ],
    });

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri, {
          dbName: `price-history-${randomUUID()}`,
          autoIndex: false,
        }),
        MongooseModule.forFeature([
          { name: PriceHistory.name, schema: PriceHistorySchema },
        ]),
      ],
      providers: [
        PriceHistoryRepository,
        {
          provide: CORPORATE_ACTIONS_PROVIDER,
          useValue: corpActions,
        },
        AdjustmentService,
      ],
    }).compile();

    service = moduleRef.get(AdjustmentService);
    repo = moduleRef.get(PriceHistoryRepository);
    model = moduleRef.get<Model<PriceHistoryDocument>>(
      getModelToken(PriceHistory.name),
    );
  }, 60_000);

  afterEach(async () => {
    await model.deleteMany({});
    vi.mocked(corpActions.getCorporateActions).mockClear();
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  it("persists bars with isAdjusted=true and rawClose retained", async () => {
    const bars = hydrateBars();

    const result = await service.applyAndPersist(
      "i-mrf",
      "MRF.NS",
      "yahoo-finance2",
      bars,
    );

    expect(result.persisted).toBe(bars.length);
    const persisted = await repo.findByInstrument("i-mrf");
    expect(persisted).toHaveLength(bars.length);
    for (const doc of persisted) {
      expect(doc.isAdjusted).toBe(true);
      expect(typeof doc.rawClose).toBe("number");
    }
  });

  it("does not call the corp-actions feed when no day-over-day move exceeds [0.9, 1.1]", async () => {
    const flat: readonly OHLCVBar[] = Array.from({ length: 5 }, (_, i) => ({
      ts: new Date(2026, 4, 20 + i),
      open: 100,
      high: 101,
      low: 99,
      close: 100 + i * 0.5,
      rawClose: 100 + i * 0.5,
      volume: 100000,
    }));

    await service.applyAndPersist("i-flat", "FLAT.NS", "yahoo-finance2", flat);

    expect(corpActions.getCorporateActions).not.toHaveBeenCalled();
  });

  it("queries the corp-actions feed when day-over-day moves outside [0.9, 1.1]", async () => {
    const bars = hydrateBars();

    await service.applyAndPersist(
      "i-mrf-call",
      "MRF.NS",
      "yahoo-finance2",
      bars,
    );

    expect(corpActions.getCorporateActions).toHaveBeenCalledOnce();
  });

  it("ignores DIVIDEND actions (no retroactive rewrite)", async () => {
    const adapterWithDividend = makeCorpActionsProvider({
      status: "ok",
      source: "stock-nse-india",
      fetchedAt: new Date(),
      data: [
        {
          ticker: "MRF",
          exDate: new Date("2026-05-19T00:00:00.000Z"),
          type: "DIVIDEND",
          value: 10,
          rawPurpose: "Final Dividend - Rs. 10 Per Share",
        },
      ],
    });
    const local = new AdjustmentService(repo, adapterWithDividend);

    const bars = hydrateBars();
    const summary = await local.applyAndPersist(
      "i-dividend",
      "MRF.NS",
      "yahoo-finance2",
      bars,
    );

    expect(summary.splitFactors).toHaveLength(0);
  });

  it("returns an empty summary for an empty bar list", async () => {
    const summary = await service.applyAndPersist(
      "i-empty",
      "EMPTY.NS",
      "yahoo-finance2",
      [],
    );
    expect(summary).toEqual({ persisted: 0, splitFactors: [] });
  });
});
