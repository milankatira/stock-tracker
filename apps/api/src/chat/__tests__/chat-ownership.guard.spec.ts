import { describe, expect, it, vi } from "vitest";
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { ChatOwnershipGuard } from "../chat-ownership.guard";
import type { ChatSessionRepo } from "../chat-session.repo";

function ctx(user: { id: string } | undefined, id: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user, params: { id } }) }),
  } as unknown as ExecutionContext;
}

function makeGuard(exists: boolean): ChatOwnershipGuard {
  const repo = { exists: vi.fn().mockResolvedValue(exists) } as unknown as ChatSessionRepo;
  return new ChatOwnershipGuard(repo);
}

describe("ChatOwnershipGuard", () => {
  it("allows the owner", async () => {
    await expect(makeGuard(true).canActivate(ctx({ id: "a" }, "s1"))).resolves.toBe(true);
  });

  it("rejects a non-owner with ForbiddenException", async () => {
    await expect(makeGuard(false).canActivate(ctx({ id: "b" }, "s1"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("rejects when the user is missing", async () => {
    await expect(makeGuard(true).canActivate(ctx(undefined, "s1"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("rejects when the session id is missing", async () => {
    await expect(makeGuard(true).canActivate(ctx({ id: "a" }, undefined))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
