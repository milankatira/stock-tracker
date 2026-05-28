import { describe, expect, it, vi } from "vitest";
import { SearchController } from "./search.controller";
import type { SearchService } from "./search.service";

function makeService(result: unknown[]) {
  return {
    searchInstruments: vi.fn().mockResolvedValue(result),
  } as unknown as SearchService;
}

describe("SearchController", () => {
  it("forwards q + type + limit to the service", async () => {
    const svc = makeService([]);
    const c = new SearchController(svc);

    await c.search({ q: "rel", type: "STOCK", limit: 5 });

    expect(svc.searchInstruments).toHaveBeenCalledWith("rel", {
      type: "STOCK",
      limit: 5,
    });
  });

  it("returns the service result verbatim", async () => {
    const result = [
      {
        id: "1",
        type: "STOCK",
        symbol: "RELIANCE",
        name: "Reliance",
        exchange: "NSE",
        score: 100,
      },
    ];
    const svc = makeService(result);
    const c = new SearchController(svc);

    await expect(c.search({ q: "rel" })).resolves.toEqual(result);
  });
});
