import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { CacheModule } from "../cache/cache.module";
import {
  NARRATIVE_CLIENT,
  NarrativeService,
} from "./narrative.service";
import { GeminiNarrativeClient } from "./gemini-narrative.client";

@Module({
  imports: [ConfigModule, CacheModule],
  providers: [
    NarrativeService,
    { provide: NARRATIVE_CLIENT, useClass: GeminiNarrativeClient },
  ],
  exports: [NarrativeService],
})
export class NarrativeModule {}
