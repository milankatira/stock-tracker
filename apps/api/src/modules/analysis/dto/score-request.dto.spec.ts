import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { ScoreRequestDto } from "./score-request.dto";

describe("ScoreRequestDto", () => {
  it("accepts complete 0..100 metric inputs", () => {
    const dto = plainToInstance(ScoreRequestDto, {
      valuation: 70,
      growth: 65,
      profitability: 72,
      balanceSheet: 68,
      momentum: 61,
      risk: 40,
    });

    expect(validateSync(dto)).toEqual([]);
  });

  it("rejects out-of-range metrics", () => {
    const dto = plainToInstance(ScoreRequestDto, {
      valuation: 101,
      growth: 65,
      profitability: 72,
      balanceSheet: 68,
      momentum: 61,
      risk: -1,
    });

    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});
