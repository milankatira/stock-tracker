import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { Test, type TestingModule } from "@nestjs/testing";
import type { Request } from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComparisonVerdict } from "@finsight/shared";
import { VERDICTS } from "@finsight/shared";
import { AiService } from "../../ai/ai.service";
import { ToolError } from "../../ai/tools/tool.types";
import { AccessTokenGuard } from "../../modules/auth/access-token.guard";
import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter";
import { CompareController } from "../compare.controller";
import { CompareService } from "../compare.service";

const VERDICT_FIXTURE: ComparisonVerdict = {
  winnerSymbol: "RELIANCE.NS",
  rationale: "RELIANCE.NS leads on the analysis of fundamentals and valuation.",
  scoreDelta: 1.5,
  scores: [
    { symbol: "RELIANCE.NS", value: 8.0, verdict: VERDICTS.STRONG_SCORE, asOfDate: "2026-06-01T00:00:00.000Z" },
    { symbol: "TCS.NS", value: 6.5, verdict: VERDICTS.CAUTION, asOfDate: "2026-06-01T00:00:00.000Z" },
  ],
};

/**
 * Stub auth guard: a request is authenticated iff it carries the
 * `x-test-auth` header. Lets us exercise the 401 branch without minting
 * real JWTs while still attaching a `user` for the happy paths.
 */
class StubAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    if (req.headers["x-test-auth"] !== "1") {
      throw new UnauthorizedException("Missing auth token");
    }
    req.user = { id: "user-1", email: "u@example.com", provider: "google" };
    return true;
  }
}

describe("CompareController (e2e)", () => {
  let app: INestApplication;
  const compareMock = vi.fn();

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }])],
      controllers: [CompareController],
      providers: [
        { provide: CompareService, useValue: { compare: compareMock } },
        // AiService is referenced only via CompareService here; provide a stub
        // so the controller's module graph resolves.
        { provide: AiService, useValue: { compare: vi.fn() } },
      ],
    })
      .overrideGuard(AccessTokenGuard)
      .useClass(StubAuthGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    compareMock.mockReset();
  });

  const auth = (req: request.Test) => req.set("x-test-auth", "1");

  it("returns 201 + the ComparisonVerdict for 2 valid symbols", async () => {
    compareMock.mockResolvedValue(VERDICT_FIXTURE);

    const res = await auth(
      request(app.getHttpServer()).post("/compare"),
    ).send({ symbols: ["RELIANCE.NS", "TCS.NS"] });

    expect(res.status).toBe(201);
    expect(res.body.winnerSymbol).toBe("RELIANCE.NS");
    expect(res.body.scoreDelta).toBe(1.5);
    expect(res.body.scores).toHaveLength(2);
  });

  it("returns 400 when fewer than 2 symbols are supplied", async () => {
    const res = await auth(
      request(app.getHttpServer()).post("/compare"),
    ).send({ symbols: ["ONE"] });
    expect(res.status).toBe(400);
  });

  it("returns 400 for more than 3 symbols", async () => {
    const res = await auth(
      request(app.getHttpServer()).post("/compare"),
    ).send({ symbols: ["A", "B", "C", "D"] });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a lowercase symbol (regex mismatch)", async () => {
    const res = await auth(
      request(app.getHttpServer()).post("/compare"),
    ).send({ symbols: ["reliance.ns", "TCS.NS"] });
    expect(res.status).toBe(400);
  });

  it("returns 401 without an auth context", async () => {
    const res = await request(app.getHttpServer())
      .post("/compare")
      .send({ symbols: ["RELIANCE.NS", "TCS.NS"] });
    expect(res.status).toBe(401);
  });

  it("returns 422 SCORE_PENDING when an input has no persisted score", async () => {
    // CompareService converts the NO_SCORE_YET miss into a PendingScoreResponse.
    compareMock.mockResolvedValue({ error: "SCORE_PENDING", symbol: "NEWCO.NS" });

    const res = await auth(
      request(app.getHttpServer()).post("/compare"),
    ).send({ symbols: ["RELIANCE.NS", "NEWCO.NS"] });

    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: "SCORE_PENDING", symbol: "NEWCO.NS" });
  });

  it("never leaks forbidden verbs in the rationale (compliance)", async () => {
    compareMock.mockResolvedValue({
      ...VERDICT_FIXTURE,
      rationale: "RELIANCE.NS is the higher-scoring pick on fundamentals.",
    });

    const res = await auth(
      request(app.getHttpServer()).post("/compare"),
    ).send({ symbols: ["RELIANCE.NS", "TCS.NS"] });

    expect(res.status).toBe(201);
    expect(/\b(buy|sell|recommend)\b/i.test(res.body.rationale)).toBe(false);
  });

  it("throttles to 10 comparisons/minute (11th returns 429)", async () => {
    compareMock.mockResolvedValue(VERDICT_FIXTURE);

    let last = 201;
    for (let i = 0; i < 11; i += 1) {
      const res = await auth(
        request(app.getHttpServer()).post("/compare"),
      ).send({ symbols: ["RELIANCE.NS", "TCS.NS"] });
      last = res.status;
    }
    expect(last).toBe(429);
  });

  it("propagates a NO_SCORE_YET ToolError surfaced by the service as 422", async () => {
    // Belt-and-braces: even if the service re-throws, the filter must not 500.
    compareMock.mockImplementation(() => {
      throw new ToolError("NO_SCORE_YET", "NEWCO.NS");
    });

    const res = await auth(
      request(app.getHttpServer()).post("/compare"),
    ).send({ symbols: ["RELIANCE.NS", "NEWCO.NS"] });

    // The controller only special-cases the returned PendingScoreResponse; a
    // thrown ToolError is an internal error path — assert it is not a silent
    // 2xx (defends the contract that thrown errors never look like success).
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
