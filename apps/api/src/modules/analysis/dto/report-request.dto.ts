import { Transform } from "class-transformer";
import { IsIn, IsString, Matches, MinLength } from "class-validator";
import { ScoreRequestDto } from "./score-request.dto";

export class ReportRequestDto extends ScoreRequestDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  assetName!: string;

  @IsIn(["stock"])
  assetType!: "stock";

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @Matches(/^[A-Za-z0-9.-]+$/)
  symbol!: string;
}
