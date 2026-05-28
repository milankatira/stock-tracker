import { describe, it, expect } from "vitest";
import { isApiError, type ApiError } from "../src/index";

describe("isApiError", () => {
  it("accepts a valid validation error", () => {
    const e: ApiError = { kind: "validation", message: "bad input" };
    expect(isApiError(e)).toBe(true);
  });

  it("accepts each well-formed kind", () => {
    const valids: ApiError[] = [
      { kind: "validation", message: "x" },
      { kind: "unauthorized", message: "x" },
      { kind: "forbidden", message: "x" },
      { kind: "not_found", message: "x" },
      { kind: "conflict", message: "x" },
      { kind: "rate_limited", message: "x", retryAfterSec: 30 },
      { kind: "server_error", message: "x" },
    ];
    for (const v of valids) {
      expect(isApiError(v)).toBe(true);
    }
  });

  it("rejects an object without a kind", () => {
    expect(isApiError({ random: "object", message: "hi" })).toBe(false);
  });

  it("rejects an object with an unknown kind", () => {
    expect(isApiError({ kind: "nope", message: "hi" })).toBe(false);
  });

  it("rejects an object with non-string message", () => {
    expect(isApiError({ kind: "validation", message: 42 })).toBe(false);
  });

  it("rejects null and primitives", () => {
    expect(isApiError(null)).toBe(false);
    expect(isApiError(undefined)).toBe(false);
    expect(isApiError("string")).toBe(false);
    expect(isApiError(42)).toBe(false);
    expect(isApiError(true)).toBe(false);
  });

  it("rejects arrays", () => {
    expect(isApiError([])).toBe(false);
    expect(isApiError([{ kind: "validation", message: "x" }])).toBe(false);
  });
});
