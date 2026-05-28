import { describe, expect, it } from "vitest";
import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { resolveAuthenticatedUser } from "./authenticated-user.decorator";
import type { AuthenticatedUser } from "./auth.service";

function makeContext(user: AuthenticatedUser | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe("resolveAuthenticatedUser", () => {
  it("returns the user attached by AccessTokenGuard", () => {
    const user: AuthenticatedUser = {
      id: "user-1",
      email: "u@test.local",
      provider: "google",
    };

    expect(resolveAuthenticatedUser(makeContext(user))).toEqual(user);
  });

  it("throws UnauthorizedException when no user has been attached", () => {
    expect(() => resolveAuthenticatedUser(makeContext(undefined))).toThrow(
      UnauthorizedException,
    );
  });

  it("throws when the attached user is missing an id", () => {
    expect(() =>
      resolveAuthenticatedUser(
        makeContext({ id: "", email: "u@test.local", provider: "local" }),
      ),
    ).toThrow(UnauthorizedException);
  });
});
