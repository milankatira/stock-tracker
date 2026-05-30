import { describe, expect, it, vi } from "vitest";
import { getInstrumentScoreTool } from "../get-instrument-score.tool";
import { ToolError } from "../tool.types";
import { FUND_DOC, makeCtx, STOCK_DOC } from "./_fixtures";

const { handler, declaration } = getInstrumentScoreTool;

describe("getInstrumentScore tool", () => {
  it("declares the Gemini function name", () => {
    expect(declaration.name).toBe("getInstrumentScore");
    expect(declaration.description).toMatch(/READ-ONLY/);
  });

  it("returns the stock score with lineage", async () => {
    const ctx = makeCtx();
    const res = await handler({ symbolOrSchemeCode: "RELIANCE", type: "stock" }, ctx);
    expect(res.data.score).toBe(STOCK_DOC.score.value);
    expect(res.data.verdict).toBe("STRONG_SCORE");
    expect(res.data.pillarBreakdown.fundamentals).toBe(8);
    expect(res.sourceTag).toBe("score:stock:RELIANCE");
    expect(res.asOfDate).toEqual(new Date(STOCK_DOC.asOf));
    expect(res.dataVersionHash).toBe("dvh-stock-123");
  });

  it("routes fund lookups to the fund report reader", async () => {
    const ctx = makeCtx();
    const res = await handler({ symbolOrSchemeCode: "120503", type: "fund" }, ctx);
    expect(res.data.score).toBe(FUND_DOC.score.value);
    expect(res.sourceTag).toBe("score:fund:120503");
    expect(ctx.fundReports.getFund).toHaveBeenCalledWith("120503");
  });

  it("throws NOT_FOUND when the report is missing", async () => {
    const ctx = makeCtx({ reports: { getStock: vi.fn().mockResolvedValue(null) } });
    await expect(
      handler({ symbolOrSchemeCode: "NOPE", type: "stock" }, ctx),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws INVALID_ARGS on a bad type", async () => {
    await expect(
      handler({ symbolOrSchemeCode: "RELIANCE", type: "crypto" }, makeCtx()),
    ).rejects.toBeInstanceOf(ToolError);
  });

  it("throws INVALID_ARGS when symbol is missing", async () => {
    await expect(handler({ type: "stock" }, makeCtx())).rejects.toMatchObject({
      code: "INVALID_ARGS",
    });
  });

  it("produces a deterministic sourceTag", async () => {
    const ctx = makeCtx();
    const a = await handler({ symbolOrSchemeCode: "RELIANCE", type: "stock" }, ctx);
    const b = await handler({ symbolOrSchemeCode: "RELIANCE", type: "stock" }, ctx);
    expect(a.sourceTag).toBe(b.sourceTag);
  });
});
