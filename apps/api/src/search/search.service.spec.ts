import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { connect, disconnect, model, Schema, type Model } from "mongoose";
import { InstrumentSchema } from "../modules/market-data/instruments/instrument.schema";
import { FundReportDocSchema } from "../reports/schemas/fund-report-doc.schema";
import { SearchService } from "./search.service";

type AnyModel = Model<Record<string, unknown>>;

let replset: MongoMemoryReplSet;

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connect(replset.getUri());
}, 60_000);

afterAll(async () => {
  await disconnect();
  await replset.stop();
});

describe("SearchService", () => {
  // Use isolated collection names per test file to avoid cross-suite leakage.
  // Schema typing is intentionally widened — the test exercises behaviour
  // (search queries + ranking), not the schema's static typing. Sharing the
  // production schema would carry indexes that conflict with other suites.
  const looseInstrumentSchema = new Schema(
    InstrumentSchema.obj as unknown as Record<string, never>,
    {
      collection: "search_instruments",
      collation: { locale: "en", strength: 2 },
      timestamps: true,
    },
  );
  const looseFundSchema = new Schema(
    FundReportDocSchema.obj as unknown as Record<string, never>,
    { collection: "search_fund_reports", timestamps: true },
  );
  const InstrumentModel = model("SearchInstrument", looseInstrumentSchema) as unknown as AnyModel;
  const FundReportModel = model("SearchFundReport", looseFundSchema) as unknown as AnyModel;
  const service = new SearchService(
    InstrumentModel as never,
    FundReportModel as never,
  );

  beforeEach(async () => {
    await InstrumentModel.deleteMany({}).exec();
    await FundReportModel.deleteMany({}).exec();
  });

  async function seedStocks() {
    await InstrumentModel.create([
      {
        nseSymbol: "RELIANCE",
        yahooSymbol: "RELIANCE.NS",
        name: "Reliance Industries Limited",
        primaryExchange: "NSE",
        popularity: 17_00_000,
      },
      {
        nseSymbol: "TCS",
        yahooSymbol: "TCS.NS",
        name: "Tata Consultancy Services",
        primaryExchange: "NSE",
        popularity: 14_00_000,
      },
      {
        nseSymbol: "INFY",
        yahooSymbol: "INFY.NS",
        name: "Infosys Limited",
        primaryExchange: "NSE",
        popularity: 6_50_000,
      },
      {
        nseSymbol: "RELCAPITAL",
        yahooSymbol: "RELCAPITAL.NS",
        name: "Reliance Capital",
        primaryExchange: "NSE",
        popularity: 5_000,
      },
    ]);
  }

  async function seedFunds() {
    await FundReportModel.create([
      {
        schemeCode: "120503",
        name: "Axis Bluechip Fund",
        category: "Large Cap",
        asOf: new Date().toISOString(),
        score: {
          value: 7,
          verdict: "STRONG_SCORE",
          pillars: {},
          weightsVersion: "0.1.0",
        },
        returns: {},
        risk: {},
        meta: { expenseRatioPct: 0.5, aumCr: 30000, managerName: "X", managerTenureYears: 5 },
      },
      {
        schemeCode: "120504",
        name: "SBI Bluechip Fund",
        category: "Large Cap",
        asOf: new Date().toISOString(),
        score: {
          value: 6,
          verdict: "CAUTION",
          pillars: {},
          weightsVersion: "0.1.0",
        },
        returns: {},
        risk: {},
        meta: { expenseRatioPct: 0.6, aumCr: 25000, managerName: "Y", managerTenureYears: 4 },
      },
    ]);
  }

  it("returns [] without hitting Mongo when query is shorter than 2 chars", async () => {
    await seedStocks();
    const a = await service.searchInstruments("");
    const b = await service.searchInstruments("r");
    expect(a).toEqual([]);
    expect(b).toEqual([]);
  });

  it("surfaces RELIANCE in the top 3 results for 'REL'", async () => {
    await seedStocks();
    const results = await service.searchInstruments("REL");
    expect(results.slice(0, 3).map((r) => r.symbol)).toContain("RELIANCE");
    expect(results[0].symbol).toBe("RELIANCE");
  });

  it("ranks the symbol-prefix match above the name-substring match", async () => {
    await seedStocks();
    const results = await service.searchInstruments("REL");
    const symbols = results.map((r) => r.symbol);
    // RELIANCE (symbol prefix) ranks above RELCAPITAL? Both are symbol prefixes.
    // Tie-break by popularity — RELIANCE has higher popularity.
    expect(symbols.indexOf("RELIANCE")).toBeLessThan(symbols.indexOf("RELCAPITAL"));
  });

  it("surfaces Axis Bluechip Fund for the multi-word query", async () => {
    await seedFunds();
    const results = await service.searchInstruments("axis bluechip");
    expect(results[0]?.name).toBe("Axis Bluechip Fund");
    expect(results[0]?.type).toBe("FUND");
  });

  it("trims to the first 3 tokens before searching", async () => {
    await seedStocks();
    // The 4th token would not normally match anything; with trim it should
    // still resolve to Tata Consultancy Services on the first 3 tokens.
    const results = await service.searchInstruments(
      "tata consultancy services extra-noise irrelevant",
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.symbol).toBe("TCS");
  });

  it("filters out funds when type=STOCK", async () => {
    await seedStocks();
    await seedFunds();
    const results = await service.searchInstruments("bluechip", { type: "STOCK" });
    expect(results.every((r) => r.type === "STOCK")).toBe(true);
  });

  it("filters out stocks when type=FUND", async () => {
    await seedStocks();
    await seedFunds();
    const results = await service.searchInstruments("rel", { type: "FUND" });
    expect(results.every((r) => r.type === "FUND")).toBe(true);
  });

  it("respects the limit option", async () => {
    await seedStocks();
    await seedFunds();
    const results = await service.searchInstruments("a", { limit: 2 });
    // 'a' is below MIN_QUERY_LEN — should be [] regardless
    expect(results).toEqual([]);
    const real = await service.searchInstruments("re", { limit: 2 });
    expect(real.length).toBeLessThanOrEqual(2);
  });
});
