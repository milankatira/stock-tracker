import { describe, expect, it, vi } from "vitest";
import { getInstrumentFundamentalsTool } from "../get-instrument-fundamentals.tool";
import { makeCtx } from "./_fixtures";

const { handler } = getInstrumentFundamentalsTool;

describe("getInstrumentFundamentals tool", () => {
  it("returns exactly the locked projection keys (no leaked fields)", async () => {
    const res = await handler({ symbol: "RELIANCE" }, makeCtx());
    expect(Object.keys(res.data).sort()).toEqual(
      ["asOf", "debtEquity", "marketCap", "pb", "pe", "roce", "roe"].sort(),
    );
    expect(res.data.pe).toBe(25.4);
    expect(res.sourceTag).toBe("fundamentals:RELIANCE");
    expect(res.dataVersionHash).toBe("dvh-stock-123");
  });

  it("throws NOT_FOUND when the stock report is missing", async () => {
    const ctx = makeCtx({ reports: { getStock: vi.fn().mockResolvedValue(null) } });
    await expect(handler({ symbol: "NOPE" }, ctx)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("throws INVALID_ARGS when symbol is absent", async () => {
    await expect(handler({}, makeCtx())).rejects.toMatchObject({
      code: "INVALID_ARGS",
    });
  });
});
