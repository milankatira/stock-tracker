import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { CreateReportDto } from "./create-report.dto";

function validate(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateReportDto, payload, { enableImplicitConversion: true });
  const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, errors };
}

const validPayload = {
  assetName: "  Reliance Industries  ",
  assetType: "stock" as const,
  symbol: " RELIANCE.NS ",
  valuation: 60,
  growth: 70,
  profitability: 65,
  balanceSheet: 80,
  momentum: 55,
  risk: 30,
};

describe("CreateReportDto", () => {
  it("accepts a fully populated stock report payload and trims string fields", () => {
    const { dto, errors } = validate(validPayload);

    expect(errors).toHaveLength(0);
    expect(dto.assetName).toBe("Reliance Industries");
    expect(dto.symbol).toBe("RELIANCE.NS");
    expect(dto.assetType).toBe("stock");
  });

  it("rejects payloads that omit required asset fields", () => {
    const { errors } = validate({ ...validPayload, assetName: "", symbol: "" });

    const fields = errors.map((error) => error.property);
    expect(fields).toEqual(expect.arrayContaining(["assetName", "symbol"]));
  });

  it("rejects symbols with invalid characters", () => {
    const { errors } = validate({ ...validPayload, symbol: "RELI@NCE" });

    const symbolError = errors.find((error) => error.property === "symbol");
    expect(symbolError).toBeDefined();
  });

  it("rejects unsupported asset types", () => {
    const { errors } = validate({ ...validPayload, assetType: "mutualFund" });

    const typeError = errors.find((error) => error.property === "assetType");
    expect(typeError).toBeDefined();
  });

  it("rejects score components outside the 0-100 range", () => {
    const { errors } = validate({ ...validPayload, valuation: 200 });

    const valuationError = errors.find((error) => error.property === "valuation");
    expect(valuationError).toBeDefined();
  });
});
