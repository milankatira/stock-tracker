import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { VERDICTS } from "@finsight/shared";
import type {
  AnalysisReport,
  AnalysisReportService,
} from "../analysis/analysis-report.service";
import type { CreateReportDto } from "./dto/create-report.dto";
import { ReportsService } from "./reports.service";
import type { ReportsRepository } from "./reports.repository";
import type { SavedReport } from "./schemas/report.schema";

function makeAnalysisReport(overrides: Partial<AnalysisReport> = {}): AnalysisReport {
  return {
    asset: { name: "Reliance Industries", type: "stock", symbol: "RELIANCE.NS" },
    quote: {
      symbol: "RELIANCE.NS",
      price: 2500.5,
      currency: "INR",
      asOf: "2026-05-27T10:00:00.000Z",
      source: "yahoo-finance",
    },
    score: {
      score: 7,
      verdict: VERDICTS.STRONG_SCORE,
      insightCards: [{ label: "Valuation", score: 60, weight: 0.2 }],
    },
    citations: ["Yahoo Finance quote for RELIANCE.NS"],
    narrative: "Strong cash generation",
    ...overrides,
  };
}

function makeSavedReport(overrides: Partial<SavedReport> = {}): SavedReport {
  const report = makeAnalysisReport();
  return {
    id: "507f1f77bcf86cd799439011",
    status: "completed",
    asset: report.asset,
    quote: report.quote,
    score: report.score,
    citations: [...report.citations],
    narrative: report.narrative,
    generation: {
      requestHash: "abc",
      requestedAt: "2026-05-27T10:00:00.000Z",
      completedAt: "2026-05-27T10:00:01.000Z",
    },
    createdAt: "2026-05-27T10:00:01.000Z",
    updatedAt: "2026-05-27T10:00:01.000Z",
    ...overrides,
  };
}

function makeDto(overrides: Partial<CreateReportDto> = {}): CreateReportDto {
  return Object.assign(
    {
      assetName: "Reliance Industries",
      assetType: "stock" as const,
      symbol: "RELIANCE.NS",
      valuation: 60,
      growth: 70,
      profitability: 65,
      balanceSheet: 80,
      momentum: 55,
      risk: 30,
    },
    overrides,
  );
}

describe("ReportsService", () => {
  it("delegates report generation, persists the snapshot, and returns the saved report", async () => {
    const analysis = {
      createStockReport: vi.fn().mockResolvedValue(makeAnalysisReport()),
    } as unknown as AnalysisReportService;
    const repository = {
      create: vi.fn().mockResolvedValue(makeSavedReport()),
    } as unknown as ReportsRepository;
    const service = new ReportsService(analysis, repository);

    const saved = await service.createForOwner("owner-1", makeDto());

    expect(analysis.createStockReport).toHaveBeenCalledOnce();
    expect(repository.create).toHaveBeenCalledOnce();
    const persisted = (repository.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(persisted).toMatchObject({
      ownerUserId: "owner-1",
      status: "completed",
      asset: { symbol: "RELIANCE.NS" },
    });
    expect(persisted.generation.requestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(saved.id).toBe("507f1f77bcf86cd799439011");
  });

  it("forwards list options to the repository", async () => {
    const repository = {
      listByOwner: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    } as unknown as ReportsRepository;
    const service = new ReportsService(
      {} as AnalysisReportService,
      repository,
    );

    await service.listForOwner("owner-1", {
      limit: 10,
      cursor: "cursor-x",
      symbol: "RELIANCE.NS",
    });

    expect(repository.listByOwner).toHaveBeenCalledWith("owner-1", {
      limit: 10,
      cursor: "cursor-x",
      symbol: "RELIANCE.NS",
    });
  });

  it("throws NotFoundException when the report does not belong to the owner", async () => {
    const repository = {
      findByOwnerAndId: vi.fn().mockResolvedValue(null),
    } as unknown as ReportsRepository;
    const service = new ReportsService(
      {} as AnalysisReportService,
      repository,
    );

    await expect(service.getForOwner("owner-1", "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("returns the saved report when ownership matches", async () => {
    const saved = makeSavedReport({ id: "507f1f77bcf86cd799439012" });
    const repository = {
      findByOwnerAndId: vi.fn().mockResolvedValue(saved),
    } as unknown as ReportsRepository;
    const service = new ReportsService(
      {} as AnalysisReportService,
      repository,
    );

    await expect(
      service.getForOwner("owner-1", "507f1f77bcf86cd799439012"),
    ).resolves.toEqual(saved);
  });
});
