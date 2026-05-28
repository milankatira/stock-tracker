import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NavSnapshot, ProviderResult } from "@finsight/shared";
import type { AmfiAdapter } from "../amfi.adapter";
import type { MfapiAdapter } from "../mfapi.adapter";
import type { StaleCacheService } from "../stale-cache/stale-cache.service";
import { FundChainService } from "./fund-chain.service";

function navOk(nav: number, source: string): ProviderResult<NavSnapshot> {
  return {
    status: "ok",
    source,
    fetchedAt: new Date(),
    data: { schemeCode: "120503", nav, date: new Date() },
  };
}

function makeMfapi(result: ProviderResult<NavSnapshot>): MfapiAdapter {
  return {
    getLatestNav: vi.fn().mockResolvedValue(result),
    getNavHistory: vi.fn(),
    listSchemes: vi.fn(),
  } as unknown as MfapiAdapter;
}

function makeAmfi(result: ProviderResult<NavSnapshot>): AmfiAdapter {
  return {
    getLatestNav: vi.fn().mockResolvedValue(result),
    getNavHistory: vi.fn(),
    listSchemes: vi.fn(),
  } as unknown as AmfiAdapter;
}

function makeStale(): StaleCacheService & {
  write: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
} {
  return {
    write: vi.fn().mockResolvedValue(undefined),
    read: vi.fn().mockResolvedValue(null),
    delete: vi.fn(),
  } as unknown as StaleCacheService & {
    write: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
  };
}

describe("FundChainService.getLatestNav", () => {
  let mfapi: MfapiAdapter;
  let amfi: AmfiAdapter;
  let stale: ReturnType<typeof makeStale>;

  beforeEach(() => {
    mfapi = makeMfapi(navOk(1024.43, "mfapi.in"));
    amfi = makeAmfi(navOk(1024.4, "amfi"));
    stale = makeStale();
  });

  it("prefers MFAPI and writes to stale-cache", async () => {
    const chain = new FundChainService(mfapi, amfi, stale as unknown as StaleCacheService);

    const result = await chain.getLatestNav("120503");

    expect(mfapi.getLatestNav).toHaveBeenCalledOnce();
    expect(amfi.getLatestNav).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "ok", source: "mfapi.in" });
    expect(stale.write).toHaveBeenCalledOnce();
  });

  it("falls back to AMFI when MFAPI errs", async () => {
    mfapi = makeMfapi({
      status: "err",
      reason: "upstream-5xx",
      message: "",
      source: "mfapi.in",
    });
    const chain = new FundChainService(mfapi, amfi, stale as unknown as StaleCacheService);

    const result = await chain.getLatestNav("120503");

    expect(result).toMatchObject({ status: "ok", source: "amfi" });
  });

  it("serves stale-cache when both providers err", async () => {
    mfapi = makeMfapi({
      status: "err",
      reason: "upstream-5xx",
      message: "",
      source: "mfapi.in",
    });
    amfi = makeAmfi({
      status: "err",
      reason: "not-found",
      message: "",
      source: "amfi",
    });
    stale.read.mockResolvedValueOnce({
      value: { schemeCode: "120503", nav: 1020, date: new Date() },
      stalenessSeconds: 3600,
    });
    const chain = new FundChainService(mfapi, amfi, stale as unknown as StaleCacheService);

    const result = await chain.getLatestNav("120503");

    expect(result.status).toBe("stale");
  });
});
