import { describe, expect, it, vi } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { makeVerdict, type FundReportDoc } from "@finsight/shared";
import {
  ANALYSIS_DISCLAIMER,
  PAST_PERF_DISCLAIMER,
} from "../compliance/disclaimers.constants";
import { FundReportsController } from "./fund-reports.controller";
import type { FundReportsService } from "./fund-reports.service";

function makeService(doc: FundReportDoc | null) {
  return {
    getFund: vi.fn().mockResolvedValue(doc),
  } as unknown as FundReportsService;
}

const sample: FundReportDoc = {
  schemeCode: "120000",
  name: "Sample Fund",
  category: "Large Cap",
  asOf: "2026-05-27T00:00:00.000Z",
  dataVersionHash: "v1",
  score: {
    value: 7,
    verdict: makeVerdict("STRONG_SCORE"),
    pillars: {
      returns: 8,
      riskAdjusted: 7,
      consistency: 6,
      costs: 7,
      manager: 7,
      portfolio: 6,
    },
    weightsVersion: "0.1.0",
  },
  returns: {
    fund: { "1y": 0, "3y": 0, "5y": 0, "10y": 0 },
    benchmark: { "1y": 0, "3y": 0, "5y": 0, "10y": 0 },
    category: { "1y": 0, "3y": 0, "5y": 0, "10y": 0 },
  },
  risk: { sharpe1y: 1, stddev1y: 1, maxDrawdown1y: -0.1 },
  holdings: [],
  sectorAllocation: [],
  meta: {
    expenseRatioPct: 0.5,
    aumCr: 1,
    managerName: "M",
    managerTenureYears: 1,
  },
  peers: [],
  narrative: null,
  disclaimers: { analysis: ANALYSIS_DISCLAIMER, pastPerformance: PAST_PERF_DISCLAIMER },
  dataLineage: [],
};

describe("FundReportsController", () => {
  it("returns the doc when found", async () => {
    const c = new FundReportsController(makeService(sample));
    await expect(c.getFund("120000")).resolves.toMatchObject({
      schemeCode: "120000",
    });
  });

  it("throws NotFoundException when service returns null", async () => {
    const c = new FundReportsController(makeService(null));
    await expect(c.getFund("999999")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws BadRequestException for non-numeric scheme codes", async () => {
    const c = new FundReportsController(makeService(sample));
    await expect(c.getFund("ABC")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws BadRequestException for scheme codes longer than 7 digits", async () => {
    const c = new FundReportsController(makeService(sample));
    await expect(c.getFund("12345678")).rejects.toBeInstanceOf(BadRequestException);
  });
});
