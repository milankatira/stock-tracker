import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AllExceptionsFilter } from "../src/common/filters/all-exceptions.filter";
import { CacheService } from "../src/modules/cache/cache.service";
import { ensureMongo } from "./setup";

describe("Health endpoints (e2e)", () => {
  let app: INestApplication;
  let cache: CacheService;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.MONGO_URI = await ensureMongo();
    const { AppModule } = await import("../src/app.module");

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    cache = app.get(CacheService);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it("GET /health returns 200 with a liveness body", async () => {
    const res = await request(app.getHttpServer()).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /health/ready returns 200 with Mongo and Redis up", async () => {
    const res = await request(app.getHttpServer()).get("/health/ready");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.info.mongo.status).toBe("up");
    expect(res.body.info.redis.status).toBe("up");
    expect(res.body.info.redis.pong).toBe("PONG");
  });

  it("GET /health/ready returns 503 and surfaces Redis down", async () => {
    vi.spyOn(cache, "ping").mockRejectedValueOnce(new Error("down"));

    const res = await request(app.getHttpServer()).get("/health/ready");

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("error");
    expect(res.body.error.redis.status).toBe("down");
    expect(res.body.error.redis.message).toBe("Redis ping failed");
  });
});
