import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { connect, disconnect, model, Schema, type Model } from "mongoose";
import { NewsSchema } from "./news.schema";
import { NewsRepository } from "./news.repository";
import { NewsService } from "./news.service";
import { InstrumentSchema } from "../modules/market-data/instruments/instrument.schema";

let replset: MongoMemoryReplSet;

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connect(replset.getUri());
}, 60_000);

afterAll(async () => {
  await disconnect();
  await replset.stop();
});

type AnyModel = Model<Record<string, unknown>>;

const looseNewsSchema = new Schema(
  NewsSchema.obj as unknown as Record<string, never>,
  {
    collection: "test_news",
    timestamps: { createdAt: "fetchedAt", updatedAt: false },
  },
);
looseNewsSchema.index({ source: 1, externalId: 1 }, { unique: true });
const NewsModel = model("NewsTest", looseNewsSchema) as unknown as AnyModel;

const looseInstrumentSchema = new Schema(
  InstrumentSchema.obj as unknown as Record<string, never>,
  {
    collection: "test_news_instruments",
    timestamps: true,
    collation: { locale: "en", strength: 2 },
  },
);
const InstrumentModel = model(
  "NewsInstrumentTest",
  looseInstrumentSchema,
) as unknown as AnyModel;

function makeInstrumentsRepoStub() {
  return {
    async findByNseSymbol(symbol: string) {
      return InstrumentModel.findOne({ nseSymbol: symbol }).lean().exec();
    },
    async listActiveTickers() {
      return InstrumentModel.find({ isActive: { $ne: false } }).lean().exec();
    },
  } as never;
}

describe("NewsService", () => {
  let repo: NewsRepository;
  let service: NewsService;

  beforeEach(async () => {
    await NewsModel.deleteMany({}).exec();
    await NewsModel.syncIndexes();
    await InstrumentModel.deleteMany({}).exec();
    repo = new NewsRepository(NewsModel as never);
    service = new NewsService(repo, makeInstrumentsRepoStub());
  });

  it("upsertPending persists a pending doc once and returns null on the second attempt", async () => {
    const item = {
      source: "et-markets",
      externalId: "guid-1",
      url: "https://example.com/a",
      canonicalUrl: "https://example.com/a",
      contentHash: "h1",
      title: "Reliance Q4",
      publishedAt: new Date(),
      instrumentMentions: ["i-1"],
    };
    const first = await service.upsertPending(item as never);
    const second = await service.upsertPending(item as never);
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(
      (first as unknown as { classificationStatus: string }).classificationStatus,
    ).toBe("pending");
  });

  it("getRecentForTicker returns sorted recent items for a known instrument", async () => {
    const inst = await InstrumentModel.create({
      nseSymbol: "RELIANCE",
      yahooSymbol: "RELIANCE.NS",
      name: "Reliance Industries",
      primaryExchange: "NSE",
      popularity: 100,
    });
    const iid = String(inst._id);
    for (let i = 0; i < 3; i += 1) {
      await service.upsertPending({
        source: "et-markets",
        externalId: `g${i}`,
        url: `https://example.com/${i}`,
        canonicalUrl: `https://example.com/${i}`,
        contentHash: `h${i}`,
        title: `Headline ${i}`,
        publishedAt: new Date(2026, 4, 27, 10 + i),
        instrumentMentions: [iid],
      } as never);
    }
    const out = await service.getRecentForTicker("RELIANCE", 5);
    expect(out).toHaveLength(3);
    expect(out[0].title).toBe("Headline 2");
    expect(out[0].sentiment).toBeNull();
  });

  it("returns [] when the ticker is unknown", async () => {
    const out = await service.getRecentForTicker("UNKNOWN");
    expect(out).toEqual([]);
  });

  it("markClassified flips classificationStatus and persists the sentiment fields", async () => {
    const inst = await InstrumentModel.create({
      nseSymbol: "TCS",
      yahooSymbol: "TCS.NS",
      name: "Tata Consultancy",
      primaryExchange: "NSE",
      popularity: 50,
    });
    const persisted = await service.upsertPending({
      source: "et-markets",
      externalId: "g-x",
      url: "https://example.com/x",
      canonicalUrl: "https://example.com/x",
      contentHash: "hx",
      title: "TCS results",
      publishedAt: new Date(),
      instrumentMentions: [String(inst._id)],
    } as never);
    const id = String((persisted as unknown as { _id: unknown })._id);

    await service.markClassified(id, {
      sentiment: "POSITIVE",
      sentimentConfidence: 0.9,
      sentimentRationale: "Strong revenue growth",
      classifierModel: "gemini-2.5-flash-lite",
      classifierVersion: "1",
    });

    const doc = await NewsModel.findById(id).lean().exec();
    expect((doc as unknown as { sentiment: string }).sentiment).toBe("POSITIVE");
    expect(
      (doc as unknown as { classificationStatus: string }).classificationStatus,
    ).toBe("classified");
  });

  it("markEmbedded persists the vector + model metadata", async () => {
    const inst = await InstrumentModel.create({
      nseSymbol: "INFY",
      yahooSymbol: "INFY.NS",
      name: "Infosys",
      primaryExchange: "NSE",
      popularity: 50,
    });
    const persisted = await service.upsertPending({
      source: "et-markets",
      externalId: "g-y",
      url: "https://example.com/y",
      canonicalUrl: "https://example.com/y",
      contentHash: "hy",
      title: "INFY guidance",
      publishedAt: new Date(),
      instrumentMentions: [String(inst._id)],
    } as never);
    const id = String((persisted as unknown as { _id: unknown })._id);
    await service.markEmbedded(id, [0.1, 0.2, 0.3], "gemini-embedding-001", "1");
    const doc = await NewsModel.findById(id).lean().exec();
    expect((doc as unknown as { embedding: number[] }).embedding).toHaveLength(3);
    expect(
      (doc as unknown as { embeddingModel: string }).embeddingModel,
    ).toBe("gemini-embedding-001");
  });
});
