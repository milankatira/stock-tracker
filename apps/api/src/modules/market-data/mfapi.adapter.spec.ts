import { describe, expect, it, vi } from "vitest";
import type { AxiosInstance } from "axios";
import { MfapiAdapter } from "./mfapi.adapter";
import mfapiLatestFixture from "../../../test/fixtures/mfapi-latest.json";
import mfapiHistoryFixture from "../../../test/fixtures/mfapi-history.json";
import mfapiSchemesFixture from "../../../test/fixtures/mfapi-schemes.json";

interface MockedAxios {
  get: ReturnType<typeof vi.fn>;
}

function makeClient(): MockedAxios {
  return { get: vi.fn() };
}

function asAxios(client: MockedAxios): AxiosInstance {
  return client as unknown as AxiosInstance;
}

function makeAxiosError(status: number, code?: string) {
  const err = new Error(`axios error ${status}`) as Error & {
    isAxiosError: boolean;
    response?: { status: number };
    code?: string;
  };
  err.isAxiosError = true;
  err.response = { status };
  if (code) err.code = code;
  return err;
}

describe("MfapiAdapter.getLatestNav", () => {
  it("returns an ok envelope with parsed NAV + IST-anchored date", async () => {
    const client = makeClient();
    client.get.mockResolvedValueOnce({ data: mfapiLatestFixture });
    const adapter = new MfapiAdapter(asAxios(client));

    const result = await adapter.getLatestNav("120503");

    expect(client.get).toHaveBeenCalledWith("/mf/120503/latest");
    expect(result).toMatchObject({
      status: "ok",
      source: "mfapi.in",
      data: { schemeCode: "120503", nav: 1024.4321 },
    });
    if (result.status === "ok") {
      expect(result.data.date).toBeInstanceOf(Date);
      expect(result.data.date.toISOString()).toContain("2026-05-26");
    }
  });

  it("returns a validation err when the payload is missing data[]", async () => {
    const client = makeClient();
    client.get.mockResolvedValueOnce({
      data: { meta: { scheme_code: 120503, scheme_name: "X" }, status: "SUCCESS" },
    });
    const adapter = new MfapiAdapter(asAxios(client));

    const result = await adapter.getLatestNav("120503");

    expect(result).toMatchObject({
      status: "err",
      reason: "validation",
      source: "mfapi.in",
    });
  });

  it("maps a 404 response to a not-found err", async () => {
    const client = makeClient();
    client.get.mockRejectedValueOnce(makeAxiosError(404));
    const adapter = new MfapiAdapter(asAxios(client));

    const result = await adapter.getLatestNav("999999");

    expect(result).toMatchObject({ status: "err", reason: "not-found" });
  });

  it("maps an upstream 5xx to upstream-5xx", async () => {
    const client = makeClient();
    client.get.mockRejectedValueOnce(makeAxiosError(503));
    const adapter = new MfapiAdapter(asAxios(client));

    const result = await adapter.getLatestNav("120503");

    expect(result).toMatchObject({ status: "err", reason: "upstream-5xx" });
  });

  it("maps a 429 response to rate-limited", async () => {
    const client = makeClient();
    client.get.mockRejectedValueOnce(makeAxiosError(429));
    const adapter = new MfapiAdapter(asAxios(client));

    const result = await adapter.getLatestNav("120503");

    expect(result).toMatchObject({ status: "err", reason: "rate-limited" });
  });

  it("maps ECONNABORTED to timeout", async () => {
    const client = makeClient();
    client.get.mockRejectedValueOnce(makeAxiosError(0, "ECONNABORTED"));
    const adapter = new MfapiAdapter(asAxios(client));

    const result = await adapter.getLatestNav("120503");

    expect(result).toMatchObject({ status: "err", reason: "timeout" });
  });
});

describe("MfapiAdapter.getNavHistory", () => {
  it("returns NavPoint[] sorted ascending by ts", async () => {
    const client = makeClient();
    client.get.mockResolvedValueOnce({ data: mfapiHistoryFixture });
    const adapter = new MfapiAdapter(asAxios(client));

    const result = await adapter.getNavHistory("120503");

    expect(client.get).toHaveBeenCalledWith("/mf/120503");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const dates = result.data.map((point) => point.ts.toISOString().slice(0, 10));
    expect(dates).toEqual([
      "2026-05-20",
      "2026-05-21",
      "2026-05-22",
      "2026-05-25",
      "2026-05-26",
    ]);
  });
});

describe("MfapiAdapter.listSchemes", () => {
  it("maps the public scheme list to SchemeMaster[] with null-stripped ISINs", async () => {
    const client = makeClient();
    client.get.mockResolvedValueOnce({ data: mfapiSchemesFixture });
    const adapter = new MfapiAdapter(asAxios(client));

    const result = await adapter.listSchemes();

    expect(client.get).toHaveBeenCalledWith("/mf");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data).toHaveLength(5);
    const icici = result.data.find((row) => row.schemeCode === "118989");
    expect(icici?.isinReinvestment).toBeNull();
    expect(result.data[0]).toMatchObject({ schemeCode: "120503" });
  });
});
