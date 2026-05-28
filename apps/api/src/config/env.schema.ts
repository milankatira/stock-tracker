import { z } from "zod";

/**
 * Boot-time env schema (FOUND-04 — fail-fast cross-phase contract).
 *
 * `ConfigModule.forRoot({ validate: (raw) => envSchema.parse(raw) })` calls
 * this at process start. A bad/missing field throws before the HTTP server
 * binds, so a misconfigured deploy crashes the pod instead of 500-ing the
 * first user-facing request.
 *
 * Mirror every key here in:
 *   - `.env.example` (root)
 *   - `apps/api/.env.test` (with ≥32-char secrets so tests boot)
 */
export const envSchema = z.object({
  // Runtime
  NODE_ENV: z.enum(["development", "test", "staging", "production"]),
  PORT: z.coerce.number().int().positive().default(3001),

  // Persistence — mongodb:// + redis:// are non-http schemes; relax URL parsing
  // to "looks like a URL" via custom regex while keeping safe defaults.
  MONGO_URI: z
    .string()
    .min(1)
    .regex(/^mongodb(\+srv)?:\/\//, "MONGO_URI must start with mongodb:// or mongodb+srv://"),
  REDIS_URL: z
    .string()
    .min(1)
    .regex(/^rediss?:\/\//, "REDIS_URL must start with redis:// or rediss://"),

  // JWT — secrets ≥32 chars (entropy floor). TTLs in seconds, coerced from string env.
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 chars"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 chars"),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(15 * 60),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(7 * 24 * 3600),

  // Google OAuth (used in Plan 03 — validated at boot now per cross-phase contract).
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CALLBACK_URL: z.string().url(),

  // Gemini (used Phase 4+ — validated at boot to prevent late surprise).
  GEMINI_API_KEY: z.string().min(1),

  // Browser clients allowed to call the API with credentials.
  WEB_ORIGINS: z
    .string()
    .min(1)
    .refine(
      (value) => value.split(",").map((origin) => origin.trim()).every(isHttpUrl),
      "WEB_ORIGINS must be comma-separated http(s) URLs",
    ),

  // Cookie / CSRF
  COOKIE_DOMAIN: z.string().min(1),
  COOKIE_SECRET: z.string().min(32, "COOKIE_SECRET must be at least 32 chars"),
  CSRF_SECRET: z.string().min(32, "CSRF_SECRET must be at least 32 chars"),

  // Phase 2 ingestion — optional supplemental news API key. Adapter is a
  // graceful no-op when this is absent, so unset (or empty) is valid.
  NEWSDATA_IO_API_KEY: z.string().min(1).optional(),

  // Phase 4 narrative-batch → Next.js revalidate webhook. Both vars are
  // optional in this phase — ReportsService.bustCache logs and skips
  // the HMAC POST when either is unset. Production sets both; Plan
  // 04-04 ships the receiver.
  REVALIDATE_HMAC_SECRET: z
    .string()
    .min(16, "REVALIDATE_HMAC_SECRET must be at least 16 chars")
    .optional(),
  REVALIDATE_WEBHOOK_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
