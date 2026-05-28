import { describe, expect, it, vi } from "vitest";
import {
  HealthCheckService,
  HealthIndicatorService,
  type HealthCheckResult,
  type HealthIndicatorFunction,
} from "@nestjs/terminus";
import type { Connection } from "mongoose";
import { HealthService } from "./health.service";
import type { CacheService } from "../cache/cache.service";
import type { MongooseHealthIndicator } from "@nestjs/terminus";

function makeService(cachePing: () => Promise<string>): {
  service: HealthService;
  healthCheck: HealthCheckService;
  mongo: MongooseHealthIndicator;
} {
  const healthCheck = {
    check: vi.fn(async (checks: HealthIndicatorFunction[]): Promise<HealthCheckResult> => {
      const results = await Promise.all(checks.map((check) => check()));
      return {
        status: results.some((result) =>
          Object.values(result).some((entry) => entry.status === "down"),
        )
          ? "error"
          : "ok",
        info: Object.assign(
          {},
          ...results.filter((result) =>
            Object.values(result).every((entry) => entry.status === "up"),
          ),
        ),
        error: Object.assign(
          {},
          ...results.filter((result) =>
            Object.values(result).some((entry) => entry.status === "down"),
          ),
        ),
        details: Object.assign({}, ...results),
      };
    }),
  } as unknown as HealthCheckService;
  const mongo = {
    pingCheck: vi.fn(async () => ({ mongo: { status: "up" as const } })),
  } as unknown as MongooseHealthIndicator;
  const cache = {
    ping: vi.fn(cachePing),
  } as unknown as CacheService;

  return {
    service: new HealthService(
      healthCheck,
      mongo,
      new HealthIndicatorService(),
      cache,
      {} as Connection,
    ),
    healthCheck,
    mongo,
  };
}

describe("HealthService", () => {
  it("returns a liveness body without dependency checks", () => {
    const { service, healthCheck } = makeService(async () => "PONG");

    expect(service.live()).toEqual({ status: "ok" });
    expect(healthCheck.check).not.toHaveBeenCalled();
  });

  it("reports Mongo and Redis as up for readiness", async () => {
    const { service, healthCheck, mongo } = makeService(async () => "PONG");

    await expect(service.ready()).resolves.toMatchObject({
      status: "ok",
      info: {
        mongo: { status: "up" },
        redis: { status: "up", pong: "PONG" },
      },
    });
    expect(healthCheck.check).toHaveBeenCalledTimes(1);
    expect(mongo.pingCheck).toHaveBeenCalledWith("mongo", {
      connection: expect.any(Object),
      timeout: 1000,
    });
  });

  it("reports Redis as down without leaking the thrown error", async () => {
    const { service } = makeService(async () => {
      throw new Error("redis://secret-password@localhost failed");
    });

    await expect(service.ready()).resolves.toMatchObject({
      status: "error",
      error: {
        redis: { status: "down", message: "Redis ping failed" },
      },
    });
  });
});
