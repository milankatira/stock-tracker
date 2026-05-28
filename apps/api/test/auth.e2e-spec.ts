import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import request from "supertest";
import { ensureMongo } from "./setup";
import { DEFAULT_GOOGLE_PROFILE, mockGoogleStrategy } from "./google-oauth.mock";
import { AllExceptionsFilter } from "../src/common/filters/all-exceptions.filter";
import { UsersRepository } from "../src/modules/users/users.repository";

describe("Auth endpoints (e2e)", () => {
  let app: INestApplication;
  let restoreGoogle: () => void;
  let users: UsersRepository;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.MONGO_URI = await ensureMongo();
    restoreGoogle = mockGoogleStrategy(DEFAULT_GOOGLE_PROFILE);
    const { AppModule } = await import("../src/app.module");

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser("test-cookie-secret-must-be-at-least-32chars"));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    users = app.get(UsersRepository);
  }, 60_000);

  afterAll(async () => {
    restoreGoogle?.();
    await app?.close();
  });

  it("GET /auth/google/callback creates a user and sets auth cookies", async () => {
    const agent = request.agent(app.getHttpServer());
    const start = await agent.get("/auth/google");
    const redirect = new URL(start.headers.location);
    const state = redirect.searchParams.get("state");

    expect(start.status).toBe(302);
    expect(redirect.hostname).toBe("accounts.google.com");
    expect(state).toEqual(expect.any(String));

    const res = await agent.get(`/auth/google/callback?state=${state}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/");
    expect(res.headers["set-cookie"]).toEqual(
      expect.arrayContaining([
        expect.stringContaining("access_token="),
        expect.stringContaining("refresh_token="),
      ]),
    );
    await expect(users.findByEmail("gtest@example.com")).resolves.toMatchObject({
      email: "gtest@example.com",
      provider: "google",
      providerId: "google-user-1",
    });

    const me = await agent.get("/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({
      email: "gtest@example.com",
      provider: "google",
    });

    const refreshed = await agent.post("/auth/refresh");
    expect(refreshed.status).toBe(201);
    expect(refreshed.body).toEqual({ authenticated: true });
  });
});
