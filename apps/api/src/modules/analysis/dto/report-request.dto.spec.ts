import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { ReportRequestDto } from "./report-request.dto";

const validBody = {
  assetName: "Reliance Industries",
  assetType: "stock",
  symbol: "RELIANCE",
  valuation: 72,
  growth: 68,
  profitability: 74,
  balanceSheet: 70,
  momentum: 64,
  risk: 35,
};

async function validateBody(body: Record<string, unknown>) {
  return validate(plainToInstance(ReportRequestDto, body));
}

describe("ReportRequestDto", () => {
  it("accepts a stock report request with score metrics", async () => {
    await expect(validateBody(validBody)).resolves.toHaveLength(0);
  });

  it("rejects unsupported asset types", async () => {
    const errors = await validateBody({ ...validBody, assetType: "crypto" });

    expect(errors.some((error) => error.property === "assetType")).toBe(true);
  });

  it("rejects blank symbols", async () => {
    const errors = await validateBody({ ...validBody, symbol: "   " });

    expect(errors.some((error) => error.property === "symbol")).toBe(true);
  });
});
