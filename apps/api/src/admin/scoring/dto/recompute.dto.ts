import { IsIn, IsMongoId, Matches } from "class-validator";

export class RecomputeDto {
  @IsMongoId()
  instrumentId!: string;

  @IsIn(["STOCK", "FUND"])
  instrumentType!: "STOCK" | "FUND";

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "asOfDate must be in YYYY-MM-DD format",
  })
  asOfDate!: string;
}
