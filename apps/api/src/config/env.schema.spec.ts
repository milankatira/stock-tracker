import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import { envSchema } from "./env.schema";

/**
 * Boot-fail-fast contract (FOUND-04): the API refuses to start when any
 * required env var is missing or malformed. These specs lock that invariant
 * at the schema level — `ConfigModule.forRoot({ validate })` calls
 * `envSchema.parse` so a throw here = bad deploy crashes before any HTTP
 * request can ever be served.
 */

/** Fixture builder — full valid env. Mutate per-test to assert rejections. */
const validEnv = (): Record<string, string> => ({
  NODE_ENV: "test",
  PORT: "3001",
  MONGO_URI: "mongodb://localhost:27017/test",
  REDIS_URL: "redis://localhost:6379",
  JWT_ACCESS_SECRET: "a".repeat(40),
  JWT_REFRESH_SECRET: "b".repeat(40),
  JWT_ACCESS_TTL_SECONDS: "900",
  JWT_REFRESH_TTL_SECONDS: "604800",
  GOOGLE_CLIENT_ID: "x",
  GOOGLE_CLIENT_SECRET: "y",
  GOOGLE_CALLBACK_URL: "http://localhost:3001/cb",
  GEMINI_API_KEY: "g",
  WEB_ORIGINS: "http://localhost:3000,https://app.finsight.local",
  COOKIE_DOMAIN: "localhost",
  COOKIE_SECRET: "c".repeat(40),
  CSRF_SECRET: "d".repeat(40),
});

describe("envSchema (FOUND-04 — boot-fail-fast env validation)", () => {
  it("accepts a complete valid env and coerces PORT to number", () => {
    const parsed = envSchema.parse(validEnv());
    expect(parsed.NODE_ENV).toBe("test");
    expect(parsed.PORT).toBe(3001);
    expect(typeof parsed.PORT).toBe("number");
    expect(parsed.JWT_ACCESS_TTL_SECONDS).toBe(900);
    expect(parsed.JWT_REFRESH_TTL_SECONDS).toBe(604800);
  });

  it("infers Env type with all 16 fields populated", () => {
    const parsed = envSchema.parse(validEnv());
    expect(Object.keys(parsed).sort()).toEqual(
      [
        "COOKIE_DOMAIN",
        "COOKIE_SECRET",
        "CSRF_SECRET",
        "GEMINI_API_KEY",
        "GOOGLE_CALLBACK_URL",
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
        "JWT_ACCESS_SECRET",
        "JWT_ACCESS_TTL_SECONDS",
        "JWT_REFRESH_SECRET",
        "JWT_REFRESH_TTL_SECONDS",
        "MONGO_URI",
        "NODE_ENV",
        "PORT",
        "REDIS_URL",
        "WEB_ORIGINS",
      ].sort(),
    );
  });

  it("throws ZodError when env is empty (every required field listed)", () => {
    expect(() => envSchema.parse({})).toThrow(ZodError);
  });

  it("rejects JWT_ACCESS_SECRET shorter than 32 chars", () => {
    const env = { ...validEnv(), JWT_ACCESS_SECRET: "too-short" };
    expect(() => envSchema.parse(env)).toThrow(/JWT_ACCESS_SECRET|at least 32/i);
  });

  it("rejects JWT_REFRESH_SECRET shorter than 32 chars", () => {
    const env = { ...validEnv(), JWT_REFRESH_SECRET: "x".repeat(31) };
    expect(() => envSchema.parse(env)).toThrow();
  });

  it("rejects COOKIE_SECRET shorter than 32 chars", () => {
    const env = { ...validEnv(), COOKIE_SECRET: "short" };
    expect(() => envSchema.parse(env)).toThrow();
  });

  it("rejects CSRF_SECRET shorter than 32 chars", () => {
    const env = { ...validEnv(), CSRF_SECRET: "" };
    expect(() => envSchema.parse(env)).toThrow();
  });

  it("rejects malformed MONGO_URI (not a URL)", () => {
    const env = { ...validEnv(), MONGO_URI: "not-a-url" };
    expect(() => envSchema.parse(env)).toThrow();
  });

  it("rejects malformed GOOGLE_CALLBACK_URL (not a URL)", () => {
    const env = { ...validEnv(), GOOGLE_CALLBACK_URL: "google.com/cb" };
    expect(() => envSchema.parse(env)).toThrow();
  });

  it("rejects malformed WEB_ORIGINS entries", () => {
    const env = { ...validEnv(), WEB_ORIGINS: "http://localhost:3000,not-a-url" };
    expect(() => envSchema.parse(env)).toThrow(/WEB_ORIGINS/);
  });

  it("rejects unknown NODE_ENV value", () => {
    const env = { ...validEnv(), NODE_ENV: "preview" };
    expect(() => envSchema.parse(env)).toThrow();
  });

  it("rejects missing GOOGLE_CLIENT_ID (boot-fail-fast cross-phase contract)", () => {
    const env: Record<string, string> = validEnv();
    delete env.GOOGLE_CLIENT_ID;
    expect(() => envSchema.parse(env)).toThrow();
  });

  it("rejects missing GEMINI_API_KEY (validated at boot even though used in Phase 4)", () => {
    const env: Record<string, string> = validEnv();
    delete env.GEMINI_API_KEY;
    expect(() => envSchema.parse(env)).toThrow();
  });

  it("coerces JWT_ACCESS_TTL_SECONDS string to positive number", () => {
    const env = { ...validEnv(), JWT_ACCESS_TTL_SECONDS: "1200" };
    const parsed = envSchema.parse(env);
    expect(parsed.JWT_ACCESS_TTL_SECONDS).toBe(1200);
  });

  it("rejects negative PORT", () => {
    const env = { ...validEnv(), PORT: "-1" };
    expect(() => envSchema.parse(env)).toThrow();
  });

  it("rejects non-numeric PORT", () => {
    const env = { ...validEnv(), PORT: "not-a-port" };
    expect(() => envSchema.parse(env)).toThrow();
  });
});
