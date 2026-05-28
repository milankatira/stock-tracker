import { describe, expect, it, vi } from "vitest";
import type { Queue } from "bullmq";
import { NarrativeBatchQueue } from "./narrative-batch.queue";

interface MockQueue {
  add: ReturnType<typeof vi.fn>;
}

function makeQueue(): MockQueue {
  return {
    add: vi.fn().mockImplementation(async (_name, _data, opts) => ({
      id: opts?.jobId,
    })),
  };
}

function asQueue(q: MockQueue): Queue {
  return q as unknown as Queue;
}

describe("NarrativeBatchQueue.enqueueForTicker", () => {
  it("uses the deterministic versioned jobId", async () => {
    const queue = makeQueue();
    const producer = new NarrativeBatchQueue(asQueue(queue));

    const id = await producer.enqueueForTicker("RELIANCE", "v1");

    expect(id).toBe("narrative:RELIANCE:v1");
    expect(queue.add).toHaveBeenCalledOnce();
    const [name, data, opts] = queue.add.mock.calls[0];
    expect(name).toBe("narrative");
    expect(data).toMatchObject({
      ticker: "RELIANCE",
      dataVersionHash: "v1",
      triggeredBy: "cron",
    });
    expect(opts).toMatchObject({
      jobId: "narrative:RELIANCE:v1",
      attempts: 3,
    });
  });

  it("propagates triggeredBy on the payload", async () => {
    const queue = makeQueue();
    const producer = new NarrativeBatchQueue(asQueue(queue));

    await producer.enqueueForTicker("RELIANCE", "v1", "admin:owner-1");

    const [, data] = queue.add.mock.calls[0];
    expect(data.triggeredBy).toBe("admin:owner-1");
  });

  it("enqueueBatch fans out one add per item", async () => {
    const queue = makeQueue();
    const producer = new NarrativeBatchQueue(asQueue(queue));

    await producer.enqueueBatch([
      { ticker: "RELIANCE", dataVersionHash: "v1" },
      { ticker: "TCS", dataVersionHash: "v1" },
      { ticker: "INFY", dataVersionHash: "v1" },
    ]);

    expect(queue.add).toHaveBeenCalledTimes(3);
  });
});
