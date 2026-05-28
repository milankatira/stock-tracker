import { describe, expect, it, vi } from "vitest";
import { FundEodRecomputedListener } from "./fund-eod-recomputed.listener";
import type { FundNarrativeBatchQueue } from "./fund-narrative-batch.queue";
import type { EodTickerRecomputedEvent } from "./eod-recomputed.event";

function makeQueue() {
  return {
    enqueueForFund: vi.fn().mockResolvedValue("fund-narrative:120000:v1"),
  } as unknown as FundNarrativeBatchQueue;
}

function makeEvent(
  overrides: Partial<EodTickerRecomputedEvent> = {},
): EodTickerRecomputedEvent {
  return {
    ticker: "120000",
    instrumentId: "abc",
    instrumentType: "FUND",
    dataVersionHash: "v1",
    asOfDate: "2026-05-27",
    ...overrides,
  };
}

describe("FundEodRecomputedListener", () => {
  it("enqueues a fund narrative job on FUND events", async () => {
    const q = makeQueue();
    const l = new FundEodRecomputedListener(q);

    await l.onEodTickerRecomputed(makeEvent());

    expect(q.enqueueForFund).toHaveBeenCalledWith(
      "120000",
      "v1",
      "eod-listener",
    );
  });

  it("ignores STOCK events (handled by EodRecomputedListener)", async () => {
    const q = makeQueue();
    const l = new FundEodRecomputedListener(q);

    await l.onEodTickerRecomputed(makeEvent({ instrumentType: "STOCK" }));

    expect(q.enqueueForFund).not.toHaveBeenCalled();
  });

  it("swallows enqueue failures so the EOD pipeline is never blocked", async () => {
    const q = makeQueue();
    vi.mocked(q.enqueueForFund).mockRejectedValueOnce(new Error("redis down"));
    const l = new FundEodRecomputedListener(q);

    await expect(l.onEodTickerRecomputed(makeEvent())).resolves.toBeUndefined();
  });
});
