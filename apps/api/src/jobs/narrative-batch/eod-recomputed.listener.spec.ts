import { describe, expect, it, vi } from "vitest";
import type { NarrativeBatchQueue } from "./narrative-batch.queue";
import { EodRecomputedListener } from "./eod-recomputed.listener";
import type { EodTickerRecomputedEvent } from "./eod-recomputed.event";

const event: EodTickerRecomputedEvent = {
  ticker: "RELIANCE",
  instrumentId: "i-rel",
  instrumentType: "STOCK",
  dataVersionHash: "v1",
  asOfDate: "2026-05-28",
};

function makeQueue(
  enqueue?: ReturnType<typeof vi.fn>,
): NarrativeBatchQueue {
  return {
    enqueueForTicker:
      enqueue ?? vi.fn().mockResolvedValue("narrative:RELIANCE:v1"),
    enqueueBatch: vi.fn(),
  } as unknown as NarrativeBatchQueue;
}

describe("EodRecomputedListener", () => {
  it("enqueues a narrative-batch job using the event's ticker + dataVersionHash", async () => {
    const queue = makeQueue();
    const listener = new EodRecomputedListener(queue);

    await listener.onEodTickerRecomputed(event);

    expect(queue.enqueueForTicker).toHaveBeenCalledWith(
      "RELIANCE",
      "v1",
      "eod-listener",
    );
  });

  it("swallows queue errors so a Phase 4 outage never blocks Phase 3", async () => {
    const enqueue = vi.fn().mockRejectedValue(new Error("redis down"));
    const queue = makeQueue(enqueue);
    const listener = new EodRecomputedListener(queue);

    await expect(listener.onEodTickerRecomputed(event)).resolves.toBeUndefined();
    expect(enqueue).toHaveBeenCalledOnce();
  });
});
