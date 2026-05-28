import { describe, expect, it, vi } from "vitest";
import type { HealthCheckResult } from "@nestjs/terminus";
import { HealthController } from "./health.controller";
import type { HealthService } from "./health.service";

describe("HealthController", () => {
  it("delegates liveness checks to HealthService", () => {
    const service = {
      live: vi.fn(() => ({ status: "ok" as const })),
      ready: vi.fn(),
    } as unknown as HealthService;
    const controller = new HealthController(service);

    expect(controller.live()).toEqual({ status: "ok" });
    expect(service.live).toHaveBeenCalledTimes(1);
    expect(service.ready).not.toHaveBeenCalled();
  });

  it("delegates readiness checks to HealthService", async () => {
    const readyBody: HealthCheckResult = {
      status: "ok",
      info: { mongo: { status: "up" }, redis: { status: "up" } },
      error: {},
      details: { mongo: { status: "up" }, redis: { status: "up" } },
    };
    const service = {
      live: vi.fn(),
      ready: vi.fn(async () => readyBody),
    } as unknown as HealthService;
    const controller = new HealthController(service);

    await expect(controller.ready()).resolves.toBe(readyBody);
    expect(service.ready).toHaveBeenCalledTimes(1);
    expect(service.live).not.toHaveBeenCalled();
  });
});
