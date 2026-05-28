import { Transform } from "class-transformer";
import { IsIn, IsString, Matches, MinLength } from "class-validator";
import { ScoreRequestDto } from "../../analysis/dto/score-request.dto";

/**
 * Request body for `POST /reports`. Mirrors `ReportRequestDto` from the
 * analysis module — by design, the create endpoint accepts **no** owner
 * field. Owner identity is derived from the access token by
 * `AccessTokenGuard` and applied server-side.
 */
export class CreateReportDto extends ScoreRequestDto {
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
