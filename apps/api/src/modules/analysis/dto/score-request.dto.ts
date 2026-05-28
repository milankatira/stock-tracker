import { Type } from "class-transformer";
import { IsNumber, Max, Min } from "class-validator";

export class ScoreRequestDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  valuation!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  growth!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  profitability!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  balanceSheet!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  momentum!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  risk!: number;
}
