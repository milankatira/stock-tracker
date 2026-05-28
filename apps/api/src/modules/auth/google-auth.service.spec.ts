import { describe, expect, it, vi } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
import { Types } from "mongoose";
import { DEFAULT_GOOGLE_PROFILE } from "../../../test/google-oauth.mock";
import { GoogleAuthService } from "./google-auth.service";
import type { AuthService } from "./auth.service";
import type { UsersRepository } from "../users/users.repository";

describe("GoogleAuthService", () => {
  it("upserts a verified Google profile and issues tokens", async () => {
    const userId = new Types.ObjectId();
    const users = {
      upsertGoogleUser: vi.fn(async () => ({
        _id: userId,
        email: "gtest@example.com",
        name: "Google Test User",
        provider: "google" as const,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    } as unknown as UsersRepository;
    const auth = {
      issueTokens: vi.fn(() => ({
        accessToken: "access",
        refreshToken: "refresh",
      })),
    } as unknown as AuthService;

    await expect(
      new GoogleAuthService(users, auth).signIn(DEFAULT_GOOGLE_PROFILE),
    ).resolves.toEqual({ accessToken: "access", refreshToken: "refresh" });
    expect(users.upsertGoogleUser).toHaveBeenCalledWith({
      providerId: "google-user-1",
      email: "gtest@example.com",
      name: "Google Test User",
      emailVerified: true,
    });
    expect(auth.issueTokens).toHaveBeenCalledWith({
      userId: String(userId),
      email: "gtest@example.com",
      provider: "google",
    });
  });

  it("rejects profiles without a verified email", async () => {
    const service = new GoogleAuthService(
      {} as UsersRepository,
      {} as AuthService,
    );

    await expect(
      service.signIn({
        ...DEFAULT_GOOGLE_PROFILE,
        emails: [{ value: "unverified@example.com", verified: false }],
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
