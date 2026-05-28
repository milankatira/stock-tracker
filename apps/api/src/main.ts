import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

/**
 * Minimal bootstrap. Helmet, ValidationPipe, cookie-parser, CSRF, and
 * global exception filter are wired in Plan 02 Task 1.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
}

bootstrap().catch((err: unknown) => {
  // Top-level boot failure — log and exit non-zero so the orchestrator
  // (k8s, Cloud Run, dev nodemon) restarts/surfaces the error.
  // eslint-disable-next-line no-console
  console.error("[bootstrap] fatal:", err);
  process.exit(1);
});
