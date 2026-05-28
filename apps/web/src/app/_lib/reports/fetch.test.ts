import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookiesMock = vi.fn();

vi.mock("next/headers", () => ({
  cookies: () => cookiesMock(),
}));

describe("getStockReport", () => {
  const realFetch = global.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    cookiesMock.mockReturnValue({
      get: (name: string) =>
        name === "access_token" ? { value: "test-token" } : undefined,
    });
  });

  afterEach(() => {
    global.fetch = realFetch;
    vi.resetModules();
  });

  it("returns the parsed StockReportDoc and tags the fetch for revalidation", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ ticker: "RELIANCE", name: "Reliance Industries" }),
    });

    const { getStockReport } = await import("./fetch");
    const doc = await getStockReport("RELIANCE");

    expect(doc).toMatchObject({ ticker: "RELIANCE" });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.next.tags).toEqual(["stock:RELIANCE"]);
    expect(init.next.revalidate).toBe(24 * 60 * 60);
    expect(init.headers.cookie).toBe("access_token=test-token");
  });

  it("returns null on 404 (unknown ticker)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    });

    const { getStockReport } = await import("./fetch");
    await expect(getStockReport("UNKNOWN")).resolves.toBeNull();
  });

  it("throws ReportFetchError on 5xx", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: () => Promise.resolve({}),
    });

    const { getStockReport, ReportFetchError } = await import("./fetch");
    await expect(getStockReport("BROKEN")).rejects.toBeInstanceOf(
      ReportFetchError,
    );
  });

  it("omits the cookie header when no access_token is set (anonymous probe)", async () => {
    cookiesMock.mockReturnValueOnce({ get: () => undefined });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ticker: "RELIANCE" }),
    });

    const { getStockReport } = await import("./fetch");
    await getStockReport("RELIANCE");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.cookie).toBeUndefined();
  });
});
