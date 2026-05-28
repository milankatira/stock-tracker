import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { getModelToken } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import request from "supertest";
import { ensureMongo } from "./setup";
import { AllExceptionsFilter } from "../src/common/filters/all-exceptions.filter";
import { MARKET_DATA_PROVIDER } from "../src/modules/market-data/market-data.service";
import { NARRATIVE_CLIENT } from "../src/modules/narrative/narrative.service";
import { AuthService } from "../src/modules/auth/auth.service";
import { UsersRepository } from "../src/modules/users/users.repository";
import {
  Report,
  type ReportDocument,
} from "../src/modules/reports/schemas/report.schema";

interface SavedUser {
  readonly id: string;
  readonly email: string;
  readonly accessToken: string;
}

const validBody = {
  assetName: "Reliance Industries",
  assetType: "stock",
  symbol: "RELIANCE",
  valuation: 72,
  growth: 68,
  profitability: 74,
  balanceSheet: 70,
  momentum: 64,
  risk: 35,
};

describe("Reports endpoints (e2e)", () => {
  let app: INestApplication;
  let users: UsersRepository;
  let auth: AuthService;
  let reportModel: Model<ReportDocument>;

  async function makeUser(email: string): Promise<SavedUser> {
    const created = await users.create({
      email,
      name: "Test User",
      provider: "local",
      emailVerified: true,
    });
    const tokens = auth.issueTokens({
      userId: created._id.toString(),
      email: created.email,
      provider: created.provider,
    });
    return { id: created._id.toString(), email: created.email, accessToken: tokens.accessToken };
  }

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

    users = app.get(UsersRepository);
    auth = app.get(AuthService);
    reportModel = app.get<Model<ReportDocument>>(getModelToken(Report.name));
  }, 60_000);

  afterEach(async () => {
    await reportModel.deleteMany({});
  });

  afterAll(async () => {
    await app?.close();
  });

  it("POST /reports persists a snapshot for the authenticated owner", async () => {
    const user = await makeUser("owner-create@test.local");

    const res = await request(app.getHttpServer())
      .post("/reports")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: "completed",
      asset: { name: "Reliance Industries", type: "stock", symbol: "RELIANCE.NS" },
      quote: { symbol: "RELIANCE.NS", price: 2450.5, currency: "INR" },
      score: { score: 7, verdict: "STRONG_SCORE" },
      narrative: "Plain-English narrative",
    });
    expect(res.body.id).toMatch(/^[a-f0-9]{24}$/);
    expect(res.body.generation.requestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(typeof res.body.createdAt).toBe("string");

    const persisted = await reportModel.findById(res.body.id).lean().exec();
    expect(persisted?.ownerUserId).toBe(user.id);
  });

  it("POST /reports rejects unauthenticated requests with 401", async () => {
    const res = await request(app.getHttpServer()).post("/reports").send(validBody);

    expect(res.status).toBe(401);
    expect(res.body.error.kind).toBe("unauthorized");
  });

  it("POST /reports rejects invalid bodies with 400", async () => {
    const user = await makeUser("owner-validation@test.local");

    const res = await request(app.getHttpServer())
      .post("/reports")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ ...validBody, valuation: 200 });

    expect(res.status).toBe(400);
    expect(res.body.error.kind).toBe("validation");
  });

  it("POST /reports ignores client-supplied ownership fields", async () => {
    const user = await makeUser("owner-strip@test.local");

    const res = await request(app.getHttpServer())
      .post("/reports")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ ...validBody, ownerUserId: "spoofed", locationId: "spoofed" });

    expect(res.status).toBe(400);
    expect(res.body.error.kind).toBe("validation");
  });

  it("GET /reports returns only reports owned by the caller", async () => {
    const owner = await makeUser("owner-list@test.local");
    const other = await makeUser("other-list@test.local");

    await request(app.getHttpServer())
      .post("/reports")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send(validBody);
    await request(app.getHttpServer())
      .post("/reports")
      .set("Authorization", `Bearer ${other.accessToken}`)
      .send(validBody);

    const res = await request(app.getHttpServer())
      .get("/reports")
      .set("Authorization", `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].asset.symbol).toBe("RELIANCE.NS");
    expect(res.body.nextCursor).toBeNull();
  });

  it("GET /reports validates query params", async () => {
    const user = await makeUser("owner-list-validation@test.local");

    const res = await request(app.getHttpServer())
      .get("/reports?limit=999")
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.kind).toBe("validation");
  });

  it("GET /reports/:id returns 404 for reports owned by another user", async () => {
    const owner = await makeUser("owner-detail@test.local");
    const other = await makeUser("other-detail@test.local");

    const created = await request(app.getHttpServer())
      .post("/reports")
      .set("Authorization", `Bearer ${other.accessToken}`)
      .send(validBody);

    expect(created.status).toBe(201);

    const res = await request(app.getHttpServer())
      .get(`/reports/${created.body.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.kind).toBe("not_found");
  });

  it("GET /reports/:id returns the saved report when ownership matches", async () => {
    const user = await makeUser("owner-detail-ok@test.local");

    const created = await request(app.getHttpServer())
      .post("/reports")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send(validBody);

    const res = await request(app.getHttpServer())
      .get(`/reports/${created.body.id}`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(res.body.asset.symbol).toBe("RELIANCE.NS");
  });

  it("POST /analysis/report continues to return an unsaved report (no auth required)", async () => {
    const res = await request(app.getHttpServer())
      .post("/analysis/report")
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      asset: { symbol: "RELIANCE.NS" },
      score: { verdict: "STRONG_SCORE" },
    });
    const count = await reportModel.countDocuments();
    expect(count).toBe(0);
  });
});
