import { describe, expect, it, vi } from "vitest";
import { getFundReturnsTool } from "../get-fund-returns.tool";
import { FUND_DOC, makeCtx } from "./_fixtures";

const { handler } = getFundReturnsTool;

describe("getFundReturns tool", () => {
  it("returns fund vs benchmark returns + category", async () => {
    const res = await handler({ schemeCode: "120503" }, makeCtx());
    expect(res.data.returns).toEqual(FUND_DOC.returns.fund);
    expect(res.data.benchmarkReturns).toEqual(FUND_DOC.returns.benchmark);
    expect(res.data.category).toBe("Flexi Cap");
    expect(res.sourceTag).toBe("returns:120503");
    expect(res.dataVersionHash).toBe("dvh-fund-456");
  });

  it("throws NOT_FOUND for an unknown scheme", async () => {
    const ctx = makeCtx({ fundReports: { getFund: vi.fn().mockResolvedValue(null) } });
    await expect(handler({ schemeCode: "000" }, ctx)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("throws INVALID_ARGS without a schemeCode", async () => {
    await expect(handler({}, makeCtx())).rejects.toMatchObject({
      code: "INVALID_ARGS",
    });
  });
});
