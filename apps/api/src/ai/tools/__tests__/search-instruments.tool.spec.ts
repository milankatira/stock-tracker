import { describe, expect, it, vi } from "vitest";
import { searchInstrumentsTool } from "../search-instruments.tool";
import { makeCtx } from "./_fixtures";

const { handler } = searchInstrumentsTool;

const MATCHES = [
  { id: "1", type: "STOCK", symbol: "RELIANCE", name: "Reliance Industries", score: 9 },
  { id: "2", type: "FUND", symbol: "120503", name: "Parag Parikh Flexi Cap", score: 8 },
];

describe("searchInstruments tool", () => {
  it("projects matches to {symbol,name,type} and normalises the sourceTag", async () => {
    const ctx = makeCtx({
      search: { searchInstruments: vi.fn().mockResolvedValue(MATCHES) },
    });
    const res = await handler({ query: "  Reliance " }, ctx);
    expect(res.data).toEqual([
      { symbol: "RELIANCE", name: "Reliance Industries", type: "STOCK" },
      { symbol: "120503", name: "Parag Parikh Flexi Cap", type: "FUND" },
    ]);
    expect(res.sourceTag).toBe("search:reliance");
  });

  it("passes the limit through to the search service", async () => {
    const spy = vi.fn().mockResolvedValue([]);
    const ctx = makeCtx({ search: { searchInstruments: spy } });
    await handler({ query: "tata", limit: 3 }, ctx);
    expect(spy).toHaveBeenCalledWith("tata", { limit: 3 });
  });

  it("throws INVALID_ARGS without a query", async () => {
    await expect(handler({}, makeCtx())).rejects.toMatchObject({
      code: "INVALID_ARGS",
    });
  });
});
