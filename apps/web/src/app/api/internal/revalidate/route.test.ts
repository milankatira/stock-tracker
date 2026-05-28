import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

const revalidateTagMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidateTag: (tag: string) => revalidateTagMock(tag),
}));

function makeRequest(body: unknown, hmacHeader: string | null) {
  return {
    json: () => Promise.resolve(body),
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "x-revalidate-hmac" ? hmacHeader : null,
    },
  } as never;
}

function signHmac(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

const TEST_SECRET = "unit-test-secret-1234567890";

describe("POST /api/internal/revalidate", () => {
  beforeEach(() => {
    process.env.REVALIDATE_HMAC_SECRET = TEST_SECRET;
    revalidateTagMock.mockClear();
  });
  afterEach(() => {
    delete process.env.REVALIDATE_HMAC_SECRET;
  });

  it("calls revalidateTag(tag) and returns 200 when HMAC is valid", async () => {
    const { POST } = await import("./route");
    const tag = "stock:RELIANCE";
    const hmac = signHmac(TEST_SECRET, tag);
    const res = await POST(makeRequest({ tag }, hmac));
    expect(res.status).toBe(200);
    expect(revalidateTagMock).toHaveBeenCalledWith(tag);
  });

  it("returns 401 when the HMAC header is missing", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ tag: "stock:RELIANCE" }, null));
    expect(res.status).toBe(401);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the HMAC header is wrong", async () => {
    const { POST } = await import("./route");
    const tag = "stock:RELIANCE";
    const wrong = signHmac("not-the-real-secret-1234567890", tag);
    const res = await POST(makeRequest({ tag }, wrong));
    expect(res.status).toBe(401);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it("returns 400 when tag is missing", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}, "deadbeef"));
    expect(res.status).toBe(400);
  });

  it("returns 500 when REVALIDATE_HMAC_SECRET is unset", async () => {
    delete process.env.REVALIDATE_HMAC_SECRET;
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ tag: "stock:RELIANCE" }, "deadbeef"));
    expect(res.status).toBe(500);
  });
});
