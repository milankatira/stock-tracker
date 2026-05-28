import { IsIn } from "class-validator";
import { TIMEFRAMES, type Timeframe } from "@finsight/shared";

export class TimeframeQueryDto {
  @IsIn(TIMEFRAMES as readonly string[])
  tf!: Timeframe;
}
