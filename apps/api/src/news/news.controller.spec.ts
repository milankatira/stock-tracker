import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { NewsController } from "./news.controller";
import type { NewsService } from "./news.service";

function makeService(items: unknown[] = []) {
  return {
    getRecentForTicker: vi.fn().mockResolvedValue(items),
  } as unknown as NewsService;
}

describe("NewsController", () => {
  it("forwards the upper-cased ticker + limit to the service", async () => {
    const svc = makeService([]);
    const c = new NewsController(svc);
    await c.list("RELIANCE", 5);
    expect(svc.getRecentForTicker).toHaveBeenCalledWith("RELIANCE", 5);
  });

  it("clamps limit to [1, 50]", async () => {
    const svc = makeService([]);
    const c = new NewsController(svc);
    await c.list("RELIANCE", 99);
    expect(svc.getRecentForTicker).toHaveBeenCalledWith("RELIANCE", 50);
  });

  it("clamps limit lower bound to 1", async () => {
    const svc = makeService([]);
    const c = new NewsController(svc);
    await c.list("RELIANCE", 0);
    expect(svc.getRecentForTicker).toHaveBeenCalledWith("RELIANCE", 1);
  });

  it("rejects tickers that violate the regex", async () => {
    const svc = makeService([]);
    const c = new NewsController(svc);
    await expect(c.list("not a ticker!", 10)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
