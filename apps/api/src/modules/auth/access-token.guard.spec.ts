import { describe, expect, it, vi } from "vitest";
import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { AccessTokenGuard } from "./access-token.guard";
import type { AuthService, AuthenticatedUser } from "./auth.service";

interface RequestShape {
  headers: Record<string, string | undefined>;
  signedCookies?: Record<string, unknown>;
  cookies?: Record<string, unknown>;
  user?: AuthenticatedUser;
}

function makeContext(request: RequestShape): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: <T = unknown>(): T => request as unknown as T,
    }),
  } as unknown as ExecutionContext;
}

function makeUser(): AuthenticatedUser {
  return { id: "user-1", email: "u@test.local", provider: "google" };
}

function makeAuthService(user: AuthenticatedUser | Error): AuthService {
  return {
    getAuthenticatedUser: vi.fn((_token: string) => {
      if (user instanceof Error) throw user;
      return user;
    }),
  } as unknown as AuthService;
}

describe("AccessTokenGuard", () => {
  it("throws when no bearer header and no cookie is present", () => {
    const guard = new AccessTokenGuard(makeAuthService(makeUser()));
    const context = makeContext({ headers: {} });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context)).toThrow(/Missing auth token/);
  });

  it("throws when the underlying token is rejected", () => {
    const guard = new AccessTokenGuard(makeAuthService(new Error("Invalid access token")));
    const context = makeContext({
      headers: { authorization: "Bearer bogus" },
    });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context)).toThrow(/Invalid auth token/);
  });

  it("authorises a bearer access token and attaches the user to the request", () => {
    const user = makeUser();
    const auth = makeAuthService(user);
    const guard = new AccessTokenGuard(auth);
    const request: RequestShape = {
      headers: { authorization: "Bearer abc.def.ghi" },
    };

    const allowed = guard.canActivate(makeContext(request));

    expect(allowed).toBe(true);
    expect(auth.getAuthenticatedUser).toHaveBeenCalledWith("abc.def.ghi");
    expect((request as Request & { user?: AuthenticatedUser }).user).toEqual(user);
  });

  it("authorises a signed access_token cookie", () => {
    const user = makeUser();
    const auth = makeAuthService(user);
    const guard = new AccessTokenGuard(auth);
    const request: RequestShape = {
      headers: {},
      signedCookies: { access_token: "signed-token" },
      cookies: { access_token: "wrong" },
    };

    expect(guard.canActivate(makeContext(request))).toBe(true);
    expect(auth.getAuthenticatedUser).toHaveBeenCalledWith("signed-token");
    expect((request as Request & { user?: AuthenticatedUser }).user).toEqual(user);
  });

  it("falls back to the unsigned access_token cookie when no signed cookie is present", () => {
    const user = makeUser();
    const auth = makeAuthService(user);
    const guard = new AccessTokenGuard(auth);
    const request: RequestShape = {
      headers: {},
      cookies: { access_token: "plain-token" },
    };

    expect(guard.canActivate(makeContext(request))).toBe(true);
    expect(auth.getAuthenticatedUser).toHaveBeenCalledWith("plain-token");
  });

  it("prefers a bearer token over a cookie when both are present", () => {
    const user = makeUser();
    const auth = makeAuthService(user);
    const guard = new AccessTokenGuard(auth);
    const request: RequestShape = {
      headers: { authorization: "Bearer header-token" },
      signedCookies: { access_token: "signed-cookie" },
    };

    expect(guard.canActivate(makeContext(request))).toBe(true);
    expect(auth.getAuthenticatedUser).toHaveBeenCalledWith("header-token");
  });

  it("ignores empty bearer values and treats them as missing tokens", () => {
    const auth = makeAuthService(makeUser());
    const guard = new AccessTokenGuard(auth);
    const context = makeContext({ headers: { authorization: "Bearer    " } });

    expect(() => guard.canActivate(context)).toThrow(/Missing auth token/);
  });
});
