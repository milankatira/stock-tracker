import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { SearchQueryDto } from "./search-query.dto";

async function check(plain: Record<string, unknown>) {
  const dto = plainToInstance(SearchQueryDto, plain);
  const errors = await validate(dto);
  return { dto, errors };
}

describe("SearchQueryDto", () => {
  it("accepts a valid query", async () => {
    const { errors } = await check({ q: "rel" });
    expect(errors).toHaveLength(0);
  });

  it("rejects q shorter than 2 chars", async () => {
    const { errors } = await check({ q: "r" });
    expect(errors[0]?.constraints).toMatchObject({
      isLength: expect.any(String),
    });
  });

  it("rejects q longer than 50 chars", async () => {
    const { errors } = await check({ q: "x".repeat(51) });
    expect(errors[0]?.constraints).toMatchObject({
      isLength: expect.any(String),
    });
  });

  it("rejects unknown type values", async () => {
    const { errors } = await check({ q: "axis", type: "ETF" });
    expect(errors[0]?.property).toBe("type");
  });

  it("rejects limit > 10", async () => {
    const { errors } = await check({ q: "axis", limit: 11 });
    expect(errors[0]?.property).toBe("limit");
  });

  it("transforms limit string to number", async () => {
    const { dto, errors } = await check({ q: "axis", limit: "3" });
    expect(errors).toHaveLength(0);
    expect(dto.limit).toBe(3);
    expect(typeof dto.limit).toBe("number");
  });
});
