import { Injectable } from "@nestjs/common";
import { calculateScore, type ScoreInput, type ScoreResult } from "@finsight/shared";

@Injectable()
export class AnalysisService {
  score(input: ScoreInput): ScoreResult {
    return calculateScore(input);
  }
}
