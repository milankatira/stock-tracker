import { describe, expect, it, vi } from "vitest";
import { WatchlistController } from "./watchlist.controller";
import type { WatchlistService } from "./watchlist.service";
import type { AuthenticatedUser } from "../modules/auth/auth.service";

type AuthedRequestLike = { user?: AuthenticatedUser };

function makeService(behaviour: Partial<WatchlistService> = {}) {
  return {
    getWithScores: vi.fn().mockResolvedValue({ items: [] }),
    addItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
    ...behaviour,
  } as unknown as WatchlistService;
}

function makeReq(userId = "user-1"): AuthedRequestLike {
  const user: AuthenticatedUser = {
    id: userId,
    email: "u@x",
    provider: "local",
  };
  return { user };
}

describe("WatchlistController", () => {
  it("uses request.user.id (NEVER any client-supplied value) on list", async () => {
    const svc = makeService();
    const c = new WatchlistController(svc);
    await c.list(makeReq("authed-user") as never);
    expect(svc.getWithScores).toHaveBeenCalledWith("authed-user");
  });

  it("uses request.user.id on add and passes the validated DTO", async () => {
    const svc = makeService();
    const c = new WatchlistController(svc);
    await c.add(makeReq("authed-user") as never, {
      instrumentId: "507f1f77bcf86cd799439011",
      instrumentType: "STOCK",
    });
    expect(svc.addItem).toHaveBeenCalledWith("authed-user", {
      instrumentId: "507f1f77bcf86cd799439011",
      instrumentType: "STOCK",
    });
  });

  it("uses request.user.id on remove", async () => {
    const svc = makeService();
    const c = new WatchlistController(svc);
    await c.remove(
      makeReq("authed-user") as never,
      "507f1f77bcf86cd799439011",
    );
    expect(svc.removeItem).toHaveBeenCalledWith(
      "authed-user",
      "507f1f77bcf86cd799439011",
    );
  });

  it("throws when request.user is missing (guard misconfiguration)", async () => {
    const svc = makeService();
    const c = new WatchlistController(svc);
    await expect(c.list({} as never)).rejects.toThrow(/AccessTokenGuard/);
  });
});
