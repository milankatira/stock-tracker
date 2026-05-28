import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import request from "supertest";
import { ensureMongo } from "./setup";
import { AllExceptionsFilter } from "../src/common/filters/all-exceptions.filter";
import { MARKET_DATA_PROVIDER } from "../src/modules/market-data/market-data.service";
import { NARRATIVE_CLIENT } from "../src/modules/narrative/narrative.service";

describe("Analysis endpoints (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.MONGO_URI = await ensureMongo();
    const { AppModule } = await import("../src/app.module");

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MARKET_DATA_PROVIDER)
      .useValue({
        getQuote: async () => ({
          symbol: "RELIANCE.NS",
          price: 2450.5,
          currency: "INR",
          asOf: "2026-05-28T06:00:00.000Z",
          source: "fixture",
        }),
      })
      .overrideProvider(NARRATIVE_CLIENT)
      .useValue({
        generate: async () => "Plain-English narrative",
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it("POST /analysis/score returns deterministic score output", async () => {
    const res = await request(app.getHttpServer()).post("/analysis/score").send({
      valuation: 72,
      growth: 68,
      profitability: 74,
      balanceSheet: 70,
      momentum: 64,
      risk: 35,
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      score: 7,
      verdict: "STRONG_SCORE",
    });
    expect(res.body.insightCards).toHaveLength(6);
  });

  it("POST /analysis/score rejects invalid metric inputs", async () => {
    const res = await request(app.getHttpServer()).post("/analysis/score").send({
      valuation: 101,
      growth: 68,
      profitability: 74,
      balanceSheet: 70,
      momentum: 64,
      risk: 35,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.kind).toBe("validation");
  });

  it("POST /analysis/report returns quote, score, citations, and narrative", async () => {
    const res = await request(app.getHttpServer()).post("/analysis/report").send({
      assetName: "Reliance Industries",
      assetType: "stock",
      symbol: "RELIANCE",
      valuation: 72,
      growth: 68,
      profitability: 74,
      balanceSheet: 70,
      momentum: 64,
      risk: 35,
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      asset: {
        name: "Reliance Industries",
        type: "stock",
        symbol: "RELIANCE.NS",
      },
      quote: {
        symbol: "RELIANCE.NS",
        price: 2450.5,
      },
      score: {
        score: 7,
        verdict: "STRONG_SCORE",
      },
      narrative: "Plain-English narrative",
    });
    expect(res.body.citations).toEqual([
      "fixture quote for RELIANCE.NS as of 2026-05-28T06:00:00.000Z",
    ]);
  });
});
