import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from "class-validator";

export class SearchQueryDto {
  @IsString()
  @Length(2, 50)
  q!: string;

  @IsOptional()
  @IsIn(["STOCK", "FUND"])
  type?: "STOCK" | "FUND";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}
