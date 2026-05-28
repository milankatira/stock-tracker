import { describe, expect, it, vi } from "vitest";
import type { Queue } from "bullmq";
import type { ActiveInstrumentProvider } from "./active-instrument.provider";
import { EodRecomputeProducer } from "./eod-recompute.producer";
import {
  EOD_CHILD_JOB_NAME,
  EOD_SCHEDULER_KEY,
  type ActiveInstrument,
} from "./eod-recompute.types";

interface MockQueue {
  upsertJobScheduler: ReturnType<typeof vi.fn>;
  addBulk: ReturnType<typeof vi.fn>;
}

function makeQueue(): MockQueue {
  return {
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
    addBulk: vi.fn().mockImplementation(async (jobs: unknown[]) => jobs),
  };
}

function asQueue(mock: MockQueue): Queue {
  return mock as unknown as Queue;
}

function makeInstrumentProvider(
  universe: readonly ActiveInstrument[],
): ActiveInstrumentProvider {
  return {
    activeUniverse: vi.fn().mockResolvedValue(universe),
  } as unknown as ActiveInstrumentProvider;
}

describe("EodRecomputeProducer.registerCron", () => {
  it("registers the 18:00 IST scheduler via upsertJobScheduler", async () => {
    const queue = makeQueue();
    const producer = new EodRecomputeProducer(
      asQueue(queue),
      makeInstrumentProvider([]),
    );

    await producer.registerCron();

    expect(queue.upsertJobScheduler).toHaveBeenCalledOnce();
    const [schedulerKey, pattern] = queue.upsertJobScheduler.mock.calls[0];
    expect(schedulerKey).toBe(EOD_SCHEDULER_KEY);
    expect(pattern).toMatchObject({
      pattern: "0 18 * * *",
      tz: "Asia/Kolkata",
    });
  });
});

describe("EodRecomputeProducer.fanOut", () => {
  function makeUniverse(size: number): ActiveInstrument[] {
    return Array.from({ length: size }, (_, i) => ({
      id: `i-${String(i).padStart(3, "0")}`,
      type: "STOCK" as const,
    }));
  }

  it("chunks the active universe into batches of 100", async () => {
    const queue = makeQueue();
    const producer = new EodRecomputeProducer(
      asQueue(queue),
      makeInstrumentProvider(makeUniverse(250)),
    );

    const result = await producer.fanOut("2026-05-28");

    expect(result).toEqual({ enqueued: 250, chunks: 3 });
    expect(queue.addBulk).toHaveBeenCalledTimes(3);
    const sizes = queue.addBulk.mock.calls.map(
      (call) => (call[0] as unknown[]).length,
    );
    expect(sizes).toEqual([100, 100, 50]);
  });

  it("uses the deterministic jobId per child for idempotency", async () => {
    const queue = makeQueue();
    const producer = new EodRecomputeProducer(
      asQueue(queue),
      makeInstrumentProvider(makeUniverse(5)),
    );

    await producer.fanOut("2026-05-28");

    const firstBatch = queue.addBulk.mock.calls[0][0] as Array<{
      name: string;
      opts: { jobId: string };
      data: { instrumentId: string; asOfDate: string };
    }>;
    expect(firstBatch.every((job) => job.name === EOD_CHILD_JOB_NAME)).toBe(true);
    expect(firstBatch.map((job) => job.opts.jobId)).toEqual([
      "i-000:2026-05-28",
      "i-001:2026-05-28",
      "i-002:2026-05-28",
      "i-003:2026-05-28",
      "i-004:2026-05-28",
    ]);
  });

  it("returns an empty result for an empty universe without calling addBulk", async () => {
    const queue = makeQueue();
    const producer = new EodRecomputeProducer(
      asQueue(queue),
      makeInstrumentProvider([]),
    );

    const result = await producer.fanOut("2026-05-28");

    expect(result).toEqual({ enqueued: 0, chunks: 0 });
    expect(queue.addBulk).not.toHaveBeenCalled();
  });

  it("stamps triggeredBy onto each child payload", async () => {
    const queue = makeQueue();
    const producer = new EodRecomputeProducer(
      asQueue(queue),
      makeInstrumentProvider(makeUniverse(2)),
    );

    await producer.fanOut("2026-05-28", "admin:owner-1");

    const batch = queue.addBulk.mock.calls[0][0] as Array<{
      data: { triggeredBy: string };
    }>;
    expect(batch.every((job) => job.data.triggeredBy === "admin:owner-1")).toBe(
      true,
    );
  });
});
