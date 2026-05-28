import { describe, expect, it, vi } from "vitest";
import type { NewsItem } from "@finsight/shared";
import type { InstrumentsRepository } from "../instruments/instruments.repository";
import type { InstrumentRecord } from "../instruments/instrument.schema";
import { TickerTaggerService } from "./ticker-tagger.service";
import { Types } from "mongoose";

function makeInstrument(
  overrides: Partial<InstrumentRecord> & {
    readonly nseSymbol: string;
    readonly yahooSymbol: string;
    readonly name: string;
  },
): InstrumentRecord {
  return {
    _id: new Types.ObjectId(),
    primaryExchange: "NSE",
    currency: "INR",
    popularity: 0,
    dataVersionHash: "",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as InstrumentRecord;
}

function makeRepo(records: InstrumentRecord[]): InstrumentsRepository {
  return {
    listActiveTickers: vi.fn().mockResolvedValue(records),
  } as unknown as InstrumentsRepository;
}

const newsItem = (title: string, body?: string): NewsItem => ({
  guid: title,
  url: `https://example.com/${encodeURIComponent(title)}`,
  title,
  source: "moneycontrol",
  publishedAt: new Date(),
  body,
});

describe("TickerTaggerService.tag", () => {
  it("tags news that mentions the instrument's NSE symbol", async () => {
    const reliance = makeInstrument({
      nseSymbol: "RELIANCE",
      yahooSymbol: "RELIANCE.NS",
      name: "Reliance Industries Limited",
    });
    const tagger = new TickerTaggerService(makeRepo([reliance]));

    const tagged = await tagger.tag([
      newsItem("RELIANCE hits new 52-week high"),
      newsItem("Nifty closes higher", "Banks and IT lead"),
    ]);

    expect(tagged[0].instrumentIds).toEqual([reliance._id!.toString()]);
    expect(tagged[1].instrumentIds).toEqual([]);
  });

  it("tags by company first-token in name", async () => {
    const reliance = makeInstrument({
      nseSymbol: "RELIANCE",
      yahooSymbol: "RELIANCE.NS",
      name: "Reliance Industries Limited",
    });
    const tagger = new TickerTaggerService(makeRepo([reliance]));

    const tagged = await tagger.tag([
      newsItem("Reliance AGM signals capex push"),
    ]);

    expect(tagged[0].instrumentIds).toEqual([reliance._id!.toString()]);
  });

  it("tags by yahoo symbol when present in the article body", async () => {
    const tcs = makeInstrument({
      nseSymbol: "TCS",
      yahooSymbol: "TCS.NS",
      name: "Tata Consultancy Services Limited",
    });
    const tagger = new TickerTaggerService(makeRepo([tcs]));

    const tagged = await tagger.tag([
      newsItem("Q4 results", "Investors watched TCS.NS closely yesterday."),
    ]);

    expect(tagged[0].instrumentIds).toEqual([tcs._id!.toString()]);
  });

  it("supports multiple matches per item", async () => {
    const reliance = makeInstrument({
      nseSymbol: "RELIANCE",
      yahooSymbol: "RELIANCE.NS",
      name: "Reliance Industries Limited",
    });
    const tcs = makeInstrument({
      nseSymbol: "TCS",
      yahooSymbol: "TCS.NS",
      name: "Tata Consultancy Services Limited",
    });
    const tagger = new TickerTaggerService(makeRepo([reliance, tcs]));

    const tagged = await tagger.tag([
      newsItem("RELIANCE and TCS lead market gains"),
    ]);

    expect(new Set(tagged[0].instrumentIds)).toEqual(
      new Set([reliance._id!.toString(), tcs._id!.toString()]),
    );
  });

  it("returns empty instrumentIds when nothing matches", async () => {
    const reliance = makeInstrument({
      nseSymbol: "RELIANCE",
      yahooSymbol: "RELIANCE.NS",
      name: "Reliance Industries Limited",
    });
    const tagger = new TickerTaggerService(makeRepo([reliance]));

    const tagged = await tagger.tag([newsItem("Auto sales hit a record")]);

    expect(tagged[0].instrumentIds).toEqual([]);
  });

  it("returns [] for an empty input list without touching the repository", async () => {
    const repo = makeRepo([
      makeInstrument({
        nseSymbol: "X",
        yahooSymbol: "X.NS",
        name: "X Ltd",
      }),
    ]);
    const tagger = new TickerTaggerService(repo);

    await expect(tagger.tag([])).resolves.toEqual([]);
    expect(repo.listActiveTickers).not.toHaveBeenCalled();
  });
});
