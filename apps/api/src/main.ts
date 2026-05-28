import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { doubleCsrf } from "csrf-csrf";
import type { Request, Response } from "express";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

/**
 * Bootstrap the NestJS application with the full security/observability
 * stack required by Plan 02:
 *
 *  - helmet              (HSTS, CSP defaults, X-Frame-Options, no powered-by)
 *  - cookie-parser       (signed auth/session cookies)
 *  - csrf-csrf           (double-submit CSRF for state-changing routes;
 *                         /auth/google/callback exempted via skipCsrfProtection)
 *  - ValidationPipe      (DTO whitelist + strip-unknown + transform)
 *  - AllExceptionsFilter (sanitized ApiError on every error path)
 *
 * ConfigService is pulled AFTER `NestFactory.create(...)` because Nest needs
 * to instantiate `ConfigModule` first, which runs the Zod env validator.
 * If env is bad the factory throws here — process.exit(1) below.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const cfg = app.get(ConfigService);
  const isProd = cfg.getOrThrow<string>("NODE_ENV") === "production";
  const webOrigins = cfg
    .getOrThrow<string>("WEB_ORIGINS")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: webOrigins,
    credentials: true,
  });

  // 1. Security headers — helmet's defaults are correct for our threat
  //    profile (CSP refined per-page when AI HTML lands in Phase 4).
  app.use(helmet());

  // 2. Cookie parsing — signed with COOKIE_SECRET so auth routes can read
  //    access/refresh tokens out of `req.cookies` / `req.signedCookies`.
  app.use(cookieParser(cfg.getOrThrow<string>("COOKIE_SECRET")));

  // 3. CSRF (double-submit) — `__Host-` prefix requires secure + path:/ + no
  //    domain. In non-prod the prefix is invalid, so fall back to a plain
  //    name for dev/test (browsers reject `__Host-*` without `secure:true`).
  const csrfCookieName = isProd ? "__Host-x-csrf" : "x-csrf";
  const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
    getSecret: () => cfg.getOrThrow<string>("CSRF_SECRET"),
    getSessionIdentifier: (req: Request) => req.ip ?? "anon",
    cookieName: csrfCookieName,
    cookieOptions: {
      sameSite: "lax",
      secure: isProd,
      path: "/",
      httpOnly: false, // double-submit pattern requires JS read access
    },
    ignoredMethods: ["GET", "HEAD", "OPTIONS"],
    // Native exemption — cleaner than wrapping middleware. Google redirects
    // through this callback; OAuth state validation happens in AuthController.
    skipCsrfProtection: (req: Request) => req.path === "/auth/google/callback",
  });

  // Token-mint endpoint for the SPA (Plan 03 tests will GET this then echo
  // the token via x-csrf-token header on state-changing requests).
  app.getHttpAdapter().get("/auth/csrf", (req, res) => {
    const request = req as Request;
    const response = res as Response;
    response.json({ token: generateCsrfToken(request, response) });
  });

  app.use(doubleCsrfProtection);

  // 4. Global validation — strips unknown fields, rejects on unknown, and
  //    transforms plain objects to DTO classes (platform DTO rule).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // 5. Sanitized error responses — last line of defense against stack-trace
  //    / PII leakage (T-01-02-01).
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(cfg.getOrThrow<number>("PORT"));
}

bootstrap().catch((err: unknown) => {
  // Top-level boot failure — Zod env errors land here. Exit non-zero so the
  // orchestrator (k8s, Cloud Run, dev nodemon) surfaces the failure instead
  // of pretending we're up. console.error is acceptable here since the Nest
  // Logger may not have been instantiated yet.
  console.error("[bootstrap] fatal:", err);
  process.exit(1);
});
