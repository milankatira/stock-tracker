import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiFetch,
  createSavedReport,
  fetchCurrentSession,
  getSavedReport,
  listSavedReports,
} from "./api-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const savedReport = {
  id: "507f1f77bcf86cd799439011",
  status: "completed",
  asset: { name: "Reliance Industries", type: "stock", symbol: "RELIANCE.NS" },
  quote: {
    symbol: "RELIANCE.NS",
    price: 2450.5,
    currency: "INR",
    asOf: "2026-05-28T06:00:00.000Z",
    source: "fixture",
  },
  score: {
    score: 7,
    verdict: "STRONG_SCORE",
    insightCards: [{ label: "Valuation", score: 72, weight: 0.2 }],
  },
  citations: ["fixture quote for RELIANCE.NS as of 2026-05-28T06:00:00.000Z"],
  narrative: "Plain-English narrative",
  generation: {
    requestHash: "abc",
    requestedAt: "2026-05-28T06:00:00.000Z",
    completedAt: "2026-05-28T06:00:01.000Z",
  },
  createdAt: "2026-05-28T06:00:01.000Z",
  updatedAt: "2026-05-28T06:00:01.000Z",
};

describe("apiFetch", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not fetch CSRF for safe GET requests", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await expect(apiFetch("/ping")).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/ping",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("adds a CSRF token header for POST requests", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ token: "csrf-token" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await expect(
      apiFetch("/analysis/report", {
        method: "POST",
        body: JSON.stringify({ symbol: "RELIANCE" }),
      }),
    ).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:3001/auth/csrf",
      expect.objectContaining({ credentials: "include", cache: "no-store" }),
    );
    const [, init] = fetchMock.mock.calls[1];
    const headers = init?.headers as Headers;
    expect(headers.get("x-csrf-token")).toBe("csrf-token");
  });

  it("unwraps API error envelopes on non-2xx responses", async () => {
    const fetchMock = vi.mocked(fetch);
    const apiError = {
      kind: "validation",
      message: "Symbol is required",
    };
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: apiError }, 400));

    await expect(apiFetch("/analysis/report")).rejects.toEqual(apiError);
  });
});

describe("saved report helpers", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a saved report via POST /reports with the request body", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ token: "csrf-token" }))
      .mockResolvedValueOnce(jsonResponse(savedReport, 201));

    await expect(
      createSavedReport({
        assetName: "Reliance",
        assetType: "stock",
        symbol: "RELIANCE",
        valuation: 60,
        growth: 70,
        profitability: 65,
        balanceSheet: 80,
        momentum: 55,
        risk: 30,
      }),
    ).resolves.toMatchObject({ id: savedReport.id });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3001/reports",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"symbol":"RELIANCE"'),
      }),
    );
  });

  it("lists saved reports with a query string", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }));

    await listSavedReports({ limit: 5, symbol: "RELIANCE.NS" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/reports?limit=5&symbol=RELIANCE.NS",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("lists saved reports without a query string when no options are provided", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }));

    await listSavedReports();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/reports",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("URL-encodes the report ID when fetching detail", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse(savedReport));

    await getSavedReport("507f1f77bcf86cd799439011");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/reports/507f1f77bcf86cd799439011",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("returns null from fetchCurrentSession when the API responds 401", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { kind: "unauthorized", message: "Missing auth token" } },
        401,
      ),
    );

    await expect(fetchCurrentSession()).resolves.toBeNull();
  });

  it("returns the session payload when authenticated", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        user: { id: "owner-1", email: "u@test.local", provider: "google" },
      }),
    );

    await expect(fetchCurrentSession()).resolves.toMatchObject({
      user: { email: "u@test.local" },
    });
  });
});
