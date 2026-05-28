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
import type { ConfigService } from "@nestjs/config";
import { MongooseModule, getModelToken } from "@nestjs/mongoose";
import { Test, type TestingModule } from "@nestjs/testing";
import type { AxiosInstance } from "axios";
import type { Model } from "mongoose";
import { ensureMongo } from "../../../../test/setup";
import type { AmfiAdapter } from "../amfi.adapter";
import { DataVersionHashService } from "./data-version-hash.service";
import { Fund, FundSchema, type FundDocument } from "./fund.schema";
import { FundsRepository } from "./funds.repository";
import {
  Instrument,
  InstrumentSchema,
  type InstrumentDocument,
} from "./instrument.schema";
import { InstrumentsRepository } from "./instruments.repository";
import { LookupService } from "./lookup.service";
import { AmfiSchemeMasterSeed } from "./seed/amfi-scheme-master.seed";
import { InstrumentMasterSeedRunner } from "./seed/instrument-master-seed.runner";
import { NseBhavcopySeed } from "./seed/nse-bhavcopy.seed";

describe("LookupService + DataVersionHashService", () => {
  let moduleRef: TestingModule;
  let lookup: LookupService;
  let versionHash: DataVersionHashService;
  let instruments: InstrumentsRepository;
  let funds: FundsRepository;
  let instrumentModel: Model<InstrumentDocument>;
  let fundModel: Model<FundDocument>;

  beforeAll(async () => {
    const uri = await ensureMongo();
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri, {
          dbName: `instruments-${randomUUID()}`,
          autoIndex: true,
        }),
        MongooseModule.forFeature([
          { name: Instrument.name, schema: InstrumentSchema },
          { name: Fund.name, schema: FundSchema },
        ]),
      ],
      providers: [
        InstrumentsRepository,
        FundsRepository,
        LookupService,
        DataVersionHashService,
      ],
    }).compile();

    lookup = moduleRef.get(LookupService);
    versionHash = moduleRef.get(DataVersionHashService);
    instruments = moduleRef.get(InstrumentsRepository);
    funds = moduleRef.get(FundsRepository);
    instrumentModel = moduleRef.get<Model<InstrumentDocument>>(
      getModelToken(Instrument.name),
    );
    fundModel = moduleRef.get<Model<FundDocument>>(getModelToken(Fund.name));

    await instrumentModel.syncIndexes();
    await fundModel.syncIndexes();
  }, 60_000);

  afterEach(async () => {
    await instrumentModel.deleteMany({});
    await fundModel.deleteMany({});
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  async function seedReliance(): Promise<string> {
    const created = await instrumentModel.create({
      nseSymbol: "RELIANCE",
      yahooSymbol: "RELIANCE.NS",
      bseCode: "500325",
      isin: "INE002A01018",
      name: "Reliance Industries Limited",
      primaryExchange: "NSE",
      currency: "INR",
      popularity: 1_500_000,
      dataVersionHash: "",
      isActive: true,
    });
    return created.id as string;
  }

  describe("cross-symbol lookups", () => {
    it("resolves NSE symbol case-insensitively to the canonical doc", async () => {
      await seedReliance();

      const upper = await lookup.lookupByNseSymbol("RELIANCE");
      const lower = await lookup.lookupByNseSymbol("reliance");

      expect(upper?.nseSymbol).toBe("RELIANCE");
      expect(lower?.nseSymbol).toBe("RELIANCE");
    });

    it("resolves Yahoo / BSE / ISIN inputs to the same canonical doc", async () => {
      await seedReliance();

      const byYahoo = await lookup.lookupByYahooSymbol("RELIANCE.NS");
      const byNse = await lookup.lookupByNseSymbol("RELIANCE");
      expect(byYahoo?._id.toString()).toBe(byNse?._id.toString());
      await expect(lookup.lookupByBseCode("500325")).resolves.toMatchObject({
        nseSymbol: "RELIANCE",
      });
      await expect(
        lookup.lookupByIsin("INE002A01018"),
      ).resolves.toMatchObject({ nseSymbol: "RELIANCE" });
    });

    it("resolveInstrument handles raw forms (NSE symbol / Yahoo suffix / BSE code / ISIN)", async () => {
      await seedReliance();

      await expect(
        lookup.resolveInstrument("RELIANCE.NS"),
      ).resolves.toMatchObject({ bseCode: "500325" });
      await expect(
        lookup.resolveInstrument("INE002A01018"),
      ).resolves.toMatchObject({ nseSymbol: "RELIANCE" });
      await expect(
        lookup.resolveInstrument("500325"),
      ).resolves.toMatchObject({ nseSymbol: "RELIANCE" });
      await expect(
        lookup.resolveInstrument("reliance"),
      ).resolves.toMatchObject({ nseSymbol: "RELIANCE" });
    });

    it("rejects duplicate nseSymbol inserts via the unique index", async () => {
      await seedReliance();

      await expect(
        instrumentModel.create({
          nseSymbol: "reliance",
          yahooSymbol: "RELIANCE2.NS",
          name: "Different",
          primaryExchange: "NSE",
          popularity: 0,
          dataVersionHash: "",
        }),
      ).rejects.toThrow();
    });
  });

  describe("DataVersionHashService", () => {
    it("produces a deterministic 40-char hex hash for identical inputs", () => {
      const a = DataVersionHashService.compute("i-1", {
        lastPriceTs: new Date("2026-05-27T08:00:00.000Z"),
      });
      const b = DataVersionHashService.compute("i-1", {
        lastPriceTs: new Date("2026-05-27T08:00:00.000Z"),
      });
      expect(a).toBe(b);
      expect(a).toMatch(/^[a-f0-9]{40}$/);
    });

    it("produces a different hash when a timestamp advances", () => {
      const a = DataVersionHashService.compute("i-1", {
        lastPriceTs: new Date("2026-05-27T08:00:00.000Z"),
      });
      const b = DataVersionHashService.compute("i-1", {
        lastPriceTs: new Date("2026-05-27T09:00:00.000Z"),
      });
      expect(a).not.toBe(b);
    });

    it("persists the new hash + advanced timestamps to the instrument doc", async () => {
      const id = await seedReliance();

      const ts1 = new Date("2026-05-27T08:00:00.000Z");
      const ts2 = new Date("2026-05-27T09:00:00.000Z");
      const hash1 = await versionHash.bump(id, { lastPriceTs: ts1 });
      const hash2 = await versionHash.bump(id, { lastPriceTs: ts2 });

      expect(hash1).not.toBe(hash2);
      const refreshed = await instruments.findById(id);
      expect(refreshed?.dataVersionHash).toBe(hash2);
      expect(refreshed?.lastPriceTs?.toISOString()).toBe(ts2.toISOString());
    });

    it("throws NotFoundException when the instrument does not exist", async () => {
      await expect(
        versionHash.bump("00000000aaaaaaaaaaaaaaaa", {
          lastPriceTs: new Date(),
        }),
      ).rejects.toThrow();
    });
  });

  describe("Fund uniqueness", () => {
    it("treats DIRECT vs REGULAR of the same name as distinct documents", async () => {
      await fundModel.create({
        schemeCode: "120503",
        amcCode: "HDFC",
        name: "HDFC Top 100 Fund",
        plan: "DIRECT",
        option: "GROWTH",
        category: "Equity - Large Cap",
        popularity: 25_000,
        dataVersionHash: "",
        isActive: true,
      });
      await fundModel.create({
        schemeCode: "118834",
        amcCode: "HDFC",
        name: "HDFC Top 100 Fund",
        plan: "REGULAR",
        option: "GROWTH",
        category: "Equity - Large Cap",
        popularity: 25_000,
        dataVersionHash: "",
        isActive: true,
      });

      const count = await fundModel.countDocuments({
        name: "HDFC Top 100 Fund",
      });
      expect(count).toBe(2);
    });

    it("preserves leading zeros in schemeCode", async () => {
      await fundModel.create({
        schemeCode: "001234",
        amcCode: "ABCMF",
        name: "ABC Test Fund - Direct - Growth",
        plan: "DIRECT",
        option: "GROWTH",
        category: "Equity",
        popularity: 0,
        dataVersionHash: "",
        isActive: true,
      });

      const found = await funds.findBySchemeCode("001234");
      expect(found?.schemeCode).toBe("001234");
    });
  });
});

describe("Seed parsers", () => {
  it("parses NSE bhav copy CSV with EQ-only filter", () => {
    const seed = new NseBhavcopySeed();
    const body =
      "SYMBOL,SERIES,OPEN,HIGH,LOW,CLOSE,LAST,PREVCLOSE,TOTTRDQTY,TOTTRDVAL,TIMESTAMP,TOTALTRADES,ISIN\n" +
      "RELIANCE,EQ,2510,2540,2502,2535,2536,2520,5320000,13456000000,27-MAY-2026,98765,INE002A01018\n" +
      "RELIANCE,BE,2510,2540,2502,2535,2536,2520,5000,1267000,27-MAY-2026,12,INE002A01018\n" +
      "TCS,EQ,3850,3890,3845,3878,3879,3852,2110000,8167000000,27-MAY-2026,52145,INE467B01029\n";

    const seeds = seed.parse(body);

    expect(seeds).toHaveLength(2);
    expect(seeds[0]).toMatchObject({
      nseSymbol: "RELIANCE",
      yahooSymbol: "RELIANCE.NS",
      primaryExchange: "NSE",
      isin: "INE002A01018",
    });
  });

  it("classifies fund plan + option from AMFI scheme names", () => {
    const seed = new AmfiSchemeMasterSeed();

    const seeds = seed.fromSchemeMasters([
      {
        schemeCode: "120503",
        schemeName: "HDFC Top 100 Fund - Direct Plan - Growth Option",
        isinGrowth: "INF179K01YV8",
        isinReinvestment: null,
      },
      {
        schemeCode: "100001",
        schemeName: "ICICI Prudential Liquid Fund - IDCW Daily Reinvestment",
        isinGrowth: null,
        isinReinvestment: "INF109K01ABC",
      },
      {
        schemeCode: "100002",
        schemeName: "SBI Bluechip Fund - Growth",
        isinGrowth: null,
        isinReinvestment: null,
      },
    ]);

    expect(seeds).toHaveLength(3);
    expect(seeds[0]).toMatchObject({ plan: "DIRECT", option: "GROWTH" });
    expect(seeds[1]).toMatchObject({ plan: "REGULAR", option: "IDCW" });
    expect(seeds[2]).toMatchObject({ plan: "REGULAR", option: "GROWTH" });
  });
});

describe("InstrumentMasterSeedRunner.run", () => {
  it("upserts instruments + funds idempotently via the AMFI adapter and bhav copy URL", async () => {
    const uri = await ensureMongo();
    const module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri, {
          dbName: `seed-run-${randomUUID()}`,
          autoIndex: true,
        }),
        MongooseModule.forFeature([
          { name: Instrument.name, schema: InstrumentSchema },
          { name: Fund.name, schema: FundSchema },
        ]),
      ],
      providers: [
        InstrumentsRepository,
        FundsRepository,
        NseBhavcopySeed,
        AmfiSchemeMasterSeed,
      ],
    }).compile();

    const localInstruments = module.get(InstrumentsRepository);
    const localFunds = module.get(FundsRepository);
    const bhavcopySeed = module.get(NseBhavcopySeed);
    const amfiSeed = module.get(AmfiSchemeMasterSeed);

    const csv =
      "SYMBOL,SERIES,ISIN,NAME\n" +
      "RELIANCE,EQ,INE002A01018,Reliance Industries Limited\n" +
      "TCS,EQ,INE467B01029,Tata Consultancy Services Limited\n";

    const fakeAmfi = {
      listSchemes: vi.fn().mockResolvedValue({
        status: "ok",
        source: "amfi",
        fetchedAt: new Date(),
        data: [
          {
            schemeCode: "120503",
            schemeName: "HDFC Top 100 Fund - Direct Plan - Growth Option",
            isinGrowth: "INF179K01YV8",
            isinReinvestment: null,
          },
        ],
      }),
    } as unknown as AmfiAdapter;

    const config = {
      get<T = unknown>(key: string): T | undefined {
        if (key === "NSE_BHAVCOPY_URL") {
          return "https://example.test/bhav.csv" as T;
        }
        return undefined;
      },
    } as unknown as ConfigService;

    const fakeHttp = {
      get: vi.fn().mockResolvedValue({ data: csv }),
    } as unknown as AxiosInstance;

    const runner = new InstrumentMasterSeedRunner(
      config,
      bhavcopySeed,
      amfiSeed,
      fakeAmfi,
      localInstruments,
      localFunds,
      fakeHttp,
    );

    const first = await runner.run();
    await runner.run();
    const afterTwoRuns = await localInstruments.listActiveTickers();

    expect(first.fundsAffected).toBeGreaterThanOrEqual(1);
    expect(first.instrumentsAffected).toBeGreaterThanOrEqual(2);
    expect(afterTwoRuns.length).toBe(first.instrumentsAffected);

    await module.close();
  });
});
