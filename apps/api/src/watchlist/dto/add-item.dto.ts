import { IsIn, IsMongoId } from "class-validator";

export class AddItemDto {
  @IsMongoId()
  instrumentId!: string;

  @IsIn(["STOCK", "FUND"])
  instrumentType!: "STOCK" | "FUND";
}
