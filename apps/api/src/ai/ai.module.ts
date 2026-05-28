import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ComplianceModule } from "../compliance/compliance.module";
import { AiService } from "./ai.service";
import { GeminiClient } from "./gemini.client";

/**
 * AIModule wires a private `GeminiClient` to the public `AiService`
 * facade. `GeminiClient` is intentionally NOT exported — combined
 * with the `no-restricted-imports` ESLint fence (`eslint.config.mjs`)
 * this enforces the COMP-02 single-chokepoint guarantee.
 */
@Module({
  imports: [ConfigModule, ComplianceModule],
  providers: [GeminiClient, AiService],
  exports: [AiService],
})
export class AiModule {}
