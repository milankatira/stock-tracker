import { describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import type { AxiosInstance } from "axios";
import { NewsDataIoAdapter } from "./newsdata-io.adapter";
import { redactApiKey } from "./newsdata-io.schemas";
import newsdataFixture from "../../../test/fixtures/newsdata-io-sample.json";

interface MockedAxios {
  get: ReturnType<typeof vi.fn>;
}

function makeClient(): MockedAxios {
  return { get: vi.fn() };
}

function asAxios(client: MockedAxios): AxiosInstance {
  return client as unknown as AxiosInstance;
}

function makeConfig(value: string | undefined): ConfigService {
  return {
    get: vi.fn(<T = unknown>() => value as T | undefined),
  } as unknown as ConfigService;
}

function makeAxiosError(status: number, code?: string, url?: string) {
  const err = new Error(`axios error ${status}`) as Error & {
    isAxiosError: boolean;
    response?: { status: number };
    code?: string;
    config?: { url?: string };
  };
  err.isAxiosError = true;
  err.response = { status };
  if (code) err.code = code;
  if (url) err.config = { url };
  return err;
}

describe("NewsDataIoAdapter.getRecent", () => {
  it("short-circuits to rate-limited without a network call when the API key is missing", async () => {
    const client = makeClient();
    const adapter = new NewsDataIoAdapter(makeConfig(undefined), asAxios(client));

    const result = await adapter.getRecent(new Date(0));

    expect(client.get).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "err",
      reason: "rate-limited",
      source: "newsdata.io",
    });
    if (result.status === "err") {
      expect(result.message).toContain("not configured");
    }
  });

  it("maps the upstream response to NewsItem[] when the API key is set", async () => {
    const client = makeClient();
    client.get.mockResolvedValueOnce({ data: newsdataFixture });
    const adapter = new NewsDataIoAdapter(
      makeConfig("test-key"),
      asAxios(client),
    );

    const since = new Date("2026-05-23T00:00:00.000Z");
    const result = await adapter.getRecent(since);

    expect(client.get).toHaveBeenCalledWith(
      "https://newsdata.io/api/1/news",
      expect.objectContaining({
        params: expect.objectContaining({
          apikey: "test-key",
          q: "business india",
          country: "in",
        }),
      }),
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data).toHaveLength(2);
    expect(result.data.every((item) => item.publishedAt > since)).toBe(true);
  });

  it("maps a 429 to a rate-limited err", async () => {
    const client = makeClient();
    client.get.mockRejectedValueOnce(makeAxiosError(429));
    const adapter = new NewsDataIoAdapter(makeConfig("test-key"), asAxios(client));

    const result = await adapter.getRecent(new Date(0));

    expect(result).toMatchObject({ status: "err", reason: "rate-limited" });
  });

  it("returns a validation err when results[] is missing", async () => {
    const client = makeClient();
    client.get.mockResolvedValueOnce({ data: { status: "success" } });
    const adapter = new NewsDataIoAdapter(makeConfig("test-key"), asAxios(client));

    const result = await adapter.getRecent(new Date(0));

    expect(result).toMatchObject({ status: "err", reason: "validation" });
  });
});

describe("redactApiKey", () => {
  it("strips the apikey query parameter from URLs", () => {
    expect(
      redactApiKey(
        "https://newsdata.io/api/1/news?apikey=secret123&q=business+india",
      ),
    ).toBe("https://newsdata.io/api/1/news?apikey=[REDACTED]&q=business+india");
  });

  it("leaves URLs without an apikey param untouched", () => {
    expect(redactApiKey("https://newsdata.io/api/1/news?q=test")).toBe(
      "https://newsdata.io/api/1/news?q=test",
    );
  });
});
