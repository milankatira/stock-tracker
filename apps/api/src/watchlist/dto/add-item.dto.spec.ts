import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { AddItemDto } from "./add-item.dto";

async function check(plain: Record<string, unknown>) {
  const dto = plainToInstance(AddItemDto, plain);
  const errors = await validate(dto);
  return { dto, errors };
}

describe("AddItemDto", () => {
  const validId = "507f1f77bcf86cd799439011";

  it("accepts a 24-hex ObjectId + STOCK type", async () => {
    const { errors } = await check({
      instrumentId: validId,
      instrumentType: "STOCK",
    });
    expect(errors).toHaveLength(0);
  });

  it("accepts FUND type", async () => {
    const { errors } = await check({
      instrumentId: validId,
      instrumentType: "FUND",
    });
    expect(errors).toHaveLength(0);
  });

  it("rejects a 23-char id", async () => {
    const { errors } = await check({
      instrumentId: "1234567890abcdef12345678".slice(0, 23),
      instrumentType: "STOCK",
    });
    expect(errors[0]?.property).toBe("instrumentId");
  });

  it("rejects an unknown instrumentType", async () => {
    const { errors } = await check({
      instrumentId: validId,
      instrumentType: "BOND",
    });
    expect(errors[0]?.property).toBe("instrumentType");
  });
});
