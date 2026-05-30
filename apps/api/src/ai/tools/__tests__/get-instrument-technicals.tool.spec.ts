import { describe, expect, it, vi } from "vitest";
import { getInstrumentTechnicalsTool } from "../get-instrument-technicals.tool";
import { makeCtx } from "./_fixtures";

const { handler } = getInstrumentTechnicalsTool;

describe("getInstrumentTechnicals tool", () => {
  it("maps rsi14 → rsi and returns the locked projection", async () => {
    const res = await handler({ symbol: "RELIANCE" }, makeCtx());
    expect(Object.keys(res.data).sort()).toEqual(
      ["asOf", "beta", "dma200", "dma50", "macdSignal", "rsi"].sort(),
    );
    expect(res.data.rsi).toBe(56.2);
    expect(res.data.macdSignal).toBe("bullish");
    expect(res.sourceTag).toBe("technicals:RELIANCE");
  });

  it("throws NOT_FOUND when the report is missing", async () => {
    const ctx = makeCtx({ reports: { getStock: vi.fn().mockResolvedValue(null) } });
    await expect(handler({ symbol: "NOPE" }, ctx)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
