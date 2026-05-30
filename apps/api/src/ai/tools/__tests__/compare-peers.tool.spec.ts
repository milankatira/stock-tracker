import { describe, expect, it, vi } from "vitest";
import { comparePeersTool } from "../compare-peers.tool";
import { makeCtx } from "./_fixtures";

const { handler } = comparePeersTool;

describe("comparePeers tool", () => {
  it("returns the default 3 peers projected to {symbol,name,score,sector}", async () => {
    const res = await handler({ symbol: "RELIANCE" }, makeCtx());
    expect(res.data).toHaveLength(3);
    expect(res.data[0]).toEqual({ symbol: "ONGC", name: "ONGC", score: 6.1, sector: "Energy" });
    expect(res.sourceTag).toBe("peers:RELIANCE:n3");
  });

  it("honours the count arg", async () => {
    const res = await handler({ symbol: "RELIANCE", count: 2 }, makeCtx());
    expect(res.data).toHaveLength(2);
    expect(res.sourceTag).toBe("peers:RELIANCE:n2");
  });

  it("throws NOT_FOUND for an unknown symbol", async () => {
    const ctx = makeCtx({ reports: { getStock: vi.fn().mockResolvedValue(null) } });
    await expect(handler({ symbol: "NOPE" }, ctx)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
