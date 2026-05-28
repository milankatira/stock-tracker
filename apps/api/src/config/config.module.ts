import { Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import { envSchema } from "./env.schema";

/**
 * Global config module — runs the Zod env validator at process start.
 *
 * - `isGlobal: true` so `ConfigService` is injectable from every module
 *   without re-importing.
 * - `envFilePath` switches on NODE_ENV so Vitest (NODE_ENV=test) sees the
 *   committed `.env.test` template while dev/staging/prod load `.env`.
 * - `validate` throws synchronously on bad config — boot halts before any
 *   route is registered (FOUND-04 cross-phase contract).
 */
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: process.env.NODE_ENV === "test" ? ".env.test" : ".env",
      validate: (raw: Record<string, unknown>) => envSchema.parse(raw),
    }),
  ],
})
export class ConfigModule {}
