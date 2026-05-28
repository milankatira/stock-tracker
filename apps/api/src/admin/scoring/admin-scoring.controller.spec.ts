import { describe, expect, it, vi } from "vitest";
import type { Queue } from "bullmq";
import { AdminScoringController } from "./admin-scoring.controller";
import type { RecomputeDto } from "./dto/recompute.dto";

function user() {
  return {
    id: "owner-1",
    email: "owner@test.local",
    provider: "google" as const,
  };
}

function dto(): RecomputeDto {
  return Object.assign(
    {
      instrumentId: "507f1f77bcf86cd799439011",
      instrumentType: "STOCK" as const,
      asOfDate: "2026-05-28",
    },
    {},
  );
}

describe("AdminScoringController.recompute", () => {
  it("enqueues with deterministic jobId + admin triggeredBy", async () => {
    const queue = {
      add: vi.fn().mockResolvedValue({ id: "507f1f77bcf86cd799439011:2026-05-28" }),
    } as unknown as Queue;
    const controller = new AdminScoringController(queue);

    const result = await controller.recompute(user(), dto());

    expect(result).toEqual({
      jobId: "507f1f77bcf86cd799439011:2026-05-28",
      status: "enqueued",
    });
    expect(queue.add).toHaveBeenCalledOnce();
    const [name, data, opts] = (queue.add as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(name).toBe("eod-recompute-child");
    expect(data).toMatchObject({
      instrumentId: "507f1f77bcf86cd799439011",
      instrumentType: "STOCK",
      asOfDate: "2026-05-28",
      triggeredBy: "admin:owner-1",
    });
    expect(opts).toMatchObject({
      jobId: "507f1f77bcf86cd799439011:2026-05-28",
      attempts: 3,
    });
  });

  it("falls back to the deterministic jobId when BullMQ returns no id", async () => {
    const queue = {
      add: vi.fn().mockResolvedValue({}),
    } as unknown as Queue;
    const controller = new AdminScoringController(queue);

    const result = await controller.recompute(user(), dto());

    expect(result.jobId).toBe("507f1f77bcf86cd799439011:2026-05-28");
  });
});
