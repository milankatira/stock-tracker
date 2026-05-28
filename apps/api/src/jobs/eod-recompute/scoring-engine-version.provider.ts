import { Injectable } from "@nestjs/common";
import { SCORING_ENGINE_VERSION } from "../../scoring/version";

/**
 * Thin injectable wrapper around the constant so the processor can be
 * unit-tested with a stubbed version (handy for version-rollover
 * tests that assert `score_history` carries the new semver).
 */
@Injectable()
export class ScoringEngineVersionProvider {
  current(): string {
    return SCORING_ENGINE_VERSION;
  }
}
