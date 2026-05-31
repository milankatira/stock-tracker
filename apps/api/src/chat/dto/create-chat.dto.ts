import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from "class-validator";
import type { ChatScopeType } from "../../ai/tools/tool.types";

export class ChatScopeDto {
  @IsIn(["stock", "fund", "portfolio", "compare"])
  type!: ChatScopeType;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @Matches(/^[A-Z0-9._-]+$/, { each: true })
  symbols!: string[];
}

export class CreateChatDto {
  @IsString()
  @Length(1, 120)
  title!: string;

  @ValidateNested()
  @Type(() => ChatScopeDto)
  scope!: ChatScopeDto;
}
