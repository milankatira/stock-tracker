import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../auth/auth.service";
import { ReportsController } from "./reports.controller";
import type { ReportsService } from "./reports.service";
import type { CreateReportDto } from "./dto/create-report.dto";

function user(): AuthenticatedUser {
  return { id: "owner-1", email: "u@test.local", provider: "google" };
}

function dto(): CreateReportDto {
  return Object.assign(
    {
      assetName: "Reliance",
      assetType: "stock" as const,
      symbol: "RELIANCE.NS",
      valuation: 60,
      growth: 70,
      profitability: 65,
      balanceSheet: 80,
      momentum: 55,
      risk: 30,
    },
  );
}

describe("ReportsController", () => {
  it("delegates create to ReportsService with the owner from the request", async () => {
    const service = {
      createForOwner: vi.fn().mockResolvedValue({ id: "id-1" }),
    } as unknown as ReportsService;
    const controller = new ReportsController(service);

    await controller.create(user(), dto());

    expect(service.createForOwner).toHaveBeenCalledWith("owner-1", expect.objectContaining({
      symbol: "RELIANCE.NS",
    }));
  });

  it("delegates list to ReportsService with the owner from the request", async () => {
    const service = {
      listForOwner: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    } as unknown as ReportsService;
    const controller = new ReportsController(service);

    await controller.list(user(), { limit: 5 });

    expect(service.listForOwner).toHaveBeenCalledWith("owner-1", { limit: 5 });
  });

  it("delegates detail to ReportsService with the owner from the request", async () => {
    const service = {
      getForOwner: vi.fn().mockResolvedValue({ id: "id-1" }),
    } as unknown as ReportsService;
    const controller = new ReportsController(service);

    await controller.detail(user(), "id-1");

    expect(service.getForOwner).toHaveBeenCalledWith("owner-1", "id-1");
  });
});
