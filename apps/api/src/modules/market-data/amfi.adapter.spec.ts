import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AxiosInstance } from "axios";
import { AmfiAdapter } from "./amfi.adapter";

const fixtureBody = readFileSync(
  resolve(__dirname, "../../../test/fixtures/amfi-navall-sample.txt"),
  "utf8",
);

function bulkBody(rowCount: number): string {
  const header = "Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date";
  const rows: string[] = [header];
  for (let i = 0; i < rowCount; i += 1) {
    const code = 100000 + i;
    rows.push(
      `${code};INF179K01YS${i % 10};INF179K01YT${i % 10};Scheme ${code};${(100 + i).toFixed(4)};27-May-2026`,
    );
  }
  return rows.join("\n");
}

interface MockedAxios {
  get: ReturnType<typeof vi.fn>;
}

function makeClient(): MockedAxios {
  return { get: vi.fn() };
}

function asAxios(client: MockedAxios): AxiosInstance {
  return client as unknown as AxiosInstance;
}

describe("AmfiAdapter.listSchemes", () => {
  it("returns the ok envelope and reports rows below the integrity floor as upstream-5xx", async () => {
    const client = makeClient();
    client.get.mockResolvedValueOnce({ data: fixtureBody });
    const adapter = new AmfiAdapter(asAxios(client));

    const result = await adapter.listSchemes();

    expect(result).toMatchObject({
      status: "err",
      reason: "upstream-5xx",
      source: "amfi",
    });
    if (result.status === "err") {
      expect(result.message).toContain("low row count");
    }
  });

  it("returns ok when the row count meets the integrity floor", async () => {
    const client = makeClient();
    client.get.mockResolvedValueOnce({ data: bulkBody(8_500) });
    const adapter = new AmfiAdapter(asAxios(client));

    const result = await adapter.listSchemes();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.length).toBeGreaterThanOrEqual(8_500);
  });
});

describe("AmfiAdapter.getLatestNav", () => {
  it("returns the matching scheme's NAV parsed to a real Date", async () => {
    const client = makeClient();
    client.get.mockResolvedValueOnce({ data: fixtureBody });
    const adapter = new AmfiAdapter(asAxios(client));

    const result = await adapter.getLatestNav("120503");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.schemeCode).toBe("120503");
    expect(result.data.nav).toBeCloseTo(1024.4321, 4);
    expect(result.data.date).toBeInstanceOf(Date);
  });

  it("returns a not-found err when the scheme is missing from the snapshot", async () => {
    const client = makeClient();
    client.get.mockResolvedValueOnce({ data: fixtureBody });
    const adapter = new AmfiAdapter(asAxios(client));

    const result = await adapter.getLatestNav("999999");

    expect(result).toMatchObject({ status: "err", reason: "not-found" });
  });
});

describe("AmfiAdapter.getNavHistory", () => {
  it("returns a typed not-found because AMFI snapshot has no history", async () => {
    const adapter = new AmfiAdapter(asAxios(makeClient()));

    const result = await adapter.getNavHistory();

    expect(result).toMatchObject({
      status: "err",
      reason: "not-found",
      source: "amfi",
    });
  });
});
