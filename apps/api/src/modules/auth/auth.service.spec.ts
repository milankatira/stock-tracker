import { describe, expect, it } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";

const configValues = {
  JWT_ACCESS_SECRET: "a".repeat(40),
  JWT_REFRESH_SECRET: "b".repeat(40),
  JWT_ACCESS_TTL_SECONDS: 900,
  JWT_REFRESH_TTL_SECONDS: 604800,
};

function makeService(overrides: Partial<typeof configValues> = {}): AuthService {
  const values = { ...configValues, ...overrides };
  const config = {
    getOrThrow<K extends keyof typeof values>(key: K): (typeof values)[K] {
      return values[key];
    },
  } as ConfigService;

  return new AuthService(config);
}

describe("AuthService", () => {
  it("mints access and refresh tokens with user identity claims", () => {
    const service = makeService();

    const tokens = service.issueTokens({
      userId: "user-1",
      email: "USER@Test.Local",
      provider: "google",
    });

    expect(tokens.accessToken).not.toBe(tokens.refreshToken);
    expect(service.verifyAccessToken(tokens.accessToken)).toMatchObject({
      sub: "user-1",
      email: "user@test.local",
      provider: "google",
      type: "access",
    });
    expect(service.verifyRefreshToken(tokens.refreshToken)).toMatchObject({
      sub: "user-1",
      type: "refresh",
    });
  });

  it("rejects tampered access tokens", () => {
    const service = makeService();
    const { accessToken } = service.issueTokens({
      userId: "user-1",
      email: "u@test.local",
      provider: "local",
    });

    expect(() => service.verifyAccessToken(`${accessToken}x`)).toThrow(
      "Invalid access token",
    );
  });

  it("rejects refresh tokens on the access-token verifier", () => {
    const service = makeService();
    const { refreshToken } = service.issueTokens({
      userId: "user-1",
      email: "u@test.local",
      provider: "local",
    });

    expect(() => service.verifyAccessToken(refreshToken)).toThrow(
      "Invalid access token",
    );
  });

  it("rejects expired tokens", () => {
    const service = makeService({ JWT_ACCESS_TTL_SECONDS: -1 });
    const { accessToken } = service.issueTokens({
      userId: "user-1",
      email: "u@test.local",
      provider: "local",
    });

    expect(() => service.verifyAccessToken(accessToken)).toThrow(
      "Invalid access token",
    );
  });

  it("refreshes a session from a valid refresh token", () => {
    const service = makeService();
    const issued = service.issueTokens({
      userId: "user-1",
      email: "u@test.local",
      provider: "local",
    });

    const refreshed = service.refreshTokens(issued.refreshToken);

    expect(service.verifyAccessToken(refreshed.accessToken)).toMatchObject({
      sub: "user-1",
      email: "u@test.local",
      provider: "local",
      type: "access",
    });
  });

  it("returns the authenticated user from an access token", () => {
    const service = makeService();
    const { accessToken } = service.issueTokens({
      userId: "user-1",
      email: "u@test.local",
      provider: "local",
    });

    expect(service.getAuthenticatedUser(accessToken)).toEqual({
      id: "user-1",
      email: "u@test.local",
      provider: "local",
    });
  });
});
