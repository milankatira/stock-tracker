import { IsArray, IsDate, IsOptional, IsString, MaxLength } from "class-validator";
import { Type } from "class-transformer";

export class ParsedNewsItemDto {
  @IsString()
  source!: string;

  @IsString()
  externalId!: string;

  @IsString()
  url!: string;

  @IsString()
  canonicalUrl!: string;

  @IsString()
  contentHash!: string;

  @IsString()
  @MaxLength(500)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @Type(() => Date)
  @IsDate()
  publishedAt!: Date;

  @IsArray()
  @IsString({ each: true })
  instrumentMentions!: string[];

  @IsOptional()
  @IsString()
  groupLevel?: string;
}
