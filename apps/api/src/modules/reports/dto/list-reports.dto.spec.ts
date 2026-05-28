import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { ListReportsDto } from "./list-reports.dto";

function validate(payload: Record<string, unknown>) {
  const dto = plainToInstance(ListReportsDto, payload, { enableImplicitConversion: true });
  const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, errors };
}

describe("ListReportsDto", () => {
  it("accepts an empty query as the default list request", () => {
    const { dto, errors } = validate({});

    expect(errors).toHaveLength(0);
    expect(dto.limit).toBeUndefined();
    expect(dto.cursor).toBeUndefined();
    expect(dto.symbol).toBeUndefined();
  });

  it("coerces limit from a query string into an integer", () => {
    const { dto, errors } = validate({ limit: "10" });

    expect(errors).toHaveLength(0);
    expect(dto.limit).toBe(10);
  });

  it("rejects a limit above the 50 ceiling", () => {
    const { errors } = validate({ limit: 100 });

    const limitError = errors.find((error) => error.property === "limit");
    expect(limitError).toBeDefined();
  });

  it("rejects a limit below 1", () => {
    const { errors } = validate({ limit: 0 });

    const limitError = errors.find((error) => error.property === "limit");
    expect(limitError).toBeDefined();
  });

  it("trims the symbol filter and validates its character set", () => {
    const { dto } = validate({ symbol: "  RELIANCE.NS  " });
    expect(dto.symbol).toBe("RELIANCE.NS");

    const { errors } = validate({ symbol: "BAD@SYMBOL" });
    expect(errors.find((error) => error.property === "symbol")).toBeDefined();
  });

  it("trims and accepts an opaque cursor string", () => {
    const { dto, errors } = validate({ cursor: "  abcdef==  " });

    expect(errors).toHaveLength(0);
    expect(dto.cursor).toBe("abcdef==");
  });
});
