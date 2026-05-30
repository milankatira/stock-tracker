import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ComplianceModule } from "../compliance/compliance.module";
import { AiService } from "./ai.service";
import { GeminiClient } from "./gemini.client";
import { TOOL_REGISTRY, TOOL_REGISTRY_TOKEN } from "./tools/tools.registry";

/**
 * AIModule wires a private `GeminiClient` to the public `AiService`
 * facade. `GeminiClient` is intentionally NOT exported — combined
 * with the `no-restricted-imports` ESLint fence (`eslint.config.mjs`)
 * this enforces the COMP-02 single-chokepoint guarantee.
 */
@Module({
  imports: [ConfigModule, ComplianceModule],
  providers: [
    GeminiClient,
    AiService,
    { provide: TOOL_REGISTRY_TOKEN, useValue: TOOL_REGISTRY },
  ],
  exports: [AiService, TOOL_REGISTRY_TOKEN],
})
export class AiModule {}
