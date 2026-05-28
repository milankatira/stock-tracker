import { describe, expect, it, vi } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
import type { Request, Response } from "express";
import type { ConfigService } from "@nestjs/config";
import { AuthController } from "./auth.controller";
import type { AuthService, AuthTokens } from "./auth.service";
import type { GoogleAuthService } from "./google-auth.service";

function makeController(auth: AuthService): AuthController {
  return new AuthController(
    auth,
    {} as GoogleAuthService,
    {} as ConfigService,
  );
}

function makeResponse(): Response {
  return {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as Response;
}

describe("AuthController", () => {
  it("returns the current user from an Authorization bearer token", () => {
    const service = {
      getAuthenticatedUser: vi.fn(() => ({
        id: "user-1",
        email: "u@test.local",
        provider: "local" as const,
      })),
    } as unknown as AuthService;
    const controller = makeController(service);

    const result = controller.me({
      headers: { authorization: "Bearer access-token" },
      cookies: {},
      signedCookies: {},
    } as unknown as Request);

    expect(result).toEqual({
      user: { id: "user-1", email: "u@test.local", provider: "local" },
    });
    expect(service.getAuthenticatedUser).toHaveBeenCalledWith("access-token");
  });

  it("refreshes tokens from the signed refresh cookie", () => {
    const tokens: AuthTokens = {
      accessToken: "access-token",
      refreshToken: "refresh-token",
    };
    const service = {
      refreshTokens: vi.fn(() => tokens),
    } as unknown as AuthService;
    const controller = makeController(service);
    const response = makeResponse();

    expect(
      controller.refresh(
        { signedCookies: { refresh_token: "old-refresh" } } as unknown as Request,
        response,
      ),
    ).toEqual({ authenticated: true });
    expect(service.refreshTokens).toHaveBeenCalledWith("old-refresh");
    expect(response.cookie).toHaveBeenCalledWith(
      "access_token",
      "access-token",
      expect.objectContaining({ httpOnly: true }),
    );
    expect(response.cookie).toHaveBeenCalledWith(
      "refresh_token",
      "refresh-token",
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it("rejects missing credentials", () => {
    const controller = makeController({} as AuthService);

    expect(() =>
      controller.me({ headers: {}, cookies: {}, signedCookies: {} } as unknown as Request),
    ).toThrow(UnauthorizedException);
  });

  it("clears auth cookies on logout", () => {
    const controller = makeController({} as AuthService);
    const response = makeResponse();

    expect(controller.logout(response)).toEqual({ ok: true });
    expect(response.clearCookie).toHaveBeenCalledWith(
      "access_token",
      expect.objectContaining({ path: "/" }),
    );
    expect(response.clearCookie).toHaveBeenCalledWith(
      "refresh_token",
      expect.objectContaining({ path: "/" }),
    );
  });
});
