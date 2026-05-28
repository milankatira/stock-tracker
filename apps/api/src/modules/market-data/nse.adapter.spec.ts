import { describe, expect, it, vi } from "vitest";
import nseQuoteFixture from "../../../test/fixtures/nse-quote.json";
import nseCorporateActionsFixture from "../../../test/fixtures/nse-corporate-actions.json";
import { NseAdapter } from "./nse.adapter";
import {
  extractDividendValue,
  extractSplitRatio,
  parseCorporateActionType,
} from "./nse.schemas";

interface NseClientStub {
  getEquityDetails: ReturnType<typeof vi.fn>;
  getEquityCorporateInfo: ReturnType<typeof vi.fn>;
}

function makeClient(): NseClientStub {
  return {
    getEquityDetails: vi.fn(),
    getEquityCorporateInfo: vi.fn(),
  };
}

describe("NseAdapter.getLatestQuote", () => {
  it("returns an ok envelope when the upstream payload validates", async () => {
    const client = makeClient();
    client.getEquityDetails.mockResolvedValueOnce(nseQuoteFixture);
    const adapter = new NseAdapter(client);

    const result = await adapter.getLatestQuote("RELIANCE.NS");

    expect(client.getEquityDetails).toHaveBeenCalledWith("RELIANCE");
    expect(result).toMatchObject({
      status: "ok",
      source: "stock-nse-india",
      data: { price: 2548.7, currency: "INR" },
    });
    if (result.status === "ok") {
      expect(result.data.asOf).toBeInstanceOf(Date);
    }
  });

  it("returns a validation err when priceInfo is missing", async () => {
    const client = makeClient();
    client.getEquityDetails.mockResolvedValueOnce({
      info: { symbol: "RELIANCE", companyName: "Reliance" },
    });
    const adapter = new NseAdapter(client);

    const result = await adapter.getLatestQuote("RELIANCE.NS");

    expect(result).toMatchObject({ status: "err", reason: "validation" });
  });

  it("rethrows non-validation upstream errors", async () => {
    const client = makeClient();
    client.getEquityDetails.mockRejectedValue(new Error("ECONNRESET"));
    const adapter = new NseAdapter(client);

    await expect(adapter.getLatestQuote("RELIANCE.NS")).rejects.toThrow(
      "ECONNRESET",
    );
  });
});

describe("NseAdapter unsupported endpoints", () => {
  it("returns not-found for getDailyHistory", async () => {
    const adapter = new NseAdapter(makeClient());

    await expect(adapter.getDailyHistory()).resolves.toMatchObject({
      status: "err",
      reason: "not-found",
      source: "stock-nse-india",
    });
  });

  it("returns not-found for getFundamentals", async () => {
    const adapter = new NseAdapter(makeClient());

    await expect(
      adapter.getFundamentals("RELIANCE.NS", ["summaryDetail"]),
    ).resolves.toMatchObject({
      status: "err",
      reason: "not-found",
      source: "stock-nse-india",
    });
  });
});

describe("NseAdapter.getCorporateActions", () => {
  it("classifies actions, filters by date window, and sorts newest first", async () => {
    const client = makeClient();
    client.getEquityCorporateInfo.mockResolvedValueOnce(nseCorporateActionsFixture);
    const adapter = new NseAdapter(client);

    const result = await adapter.getCorporateActions(
      "RELIANCE.NS",
      new Date("2017-01-01T00:00:00.000Z"),
      new Date("2027-01-01T00:00:00.000Z"),
    );

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data).toHaveLength(3);
    expect(result.data.map((event) => event.type)).toEqual([
      "SPLIT",
      "DIVIDEND",
      "BONUS",
    ]);
    const split = result.data[0];
    expect(split.ratio).toBe("2:10");
    const dividend = result.data[1];
    expect(dividend.value).toBe(8);
  });

  it("returns a validation err when the corporate-info payload is malformed", async () => {
    const client = makeClient();
    client.getEquityCorporateInfo.mockResolvedValueOnce({});
    const adapter = new NseAdapter(client);

    const result = await adapter.getCorporateActions(
      "RELIANCE.NS",
      new Date(2010, 0, 1),
      new Date(2030, 0, 1),
    );

    expect(result).toMatchObject({ status: "err", reason: "validation" });
  });
});

describe("parseCorporateActionType", () => {
  const samples: ReadonlyArray<{ purpose: string; expected: ReturnType<typeof parseCorporateActionType> }> = [
    { purpose: "Face Value Split (Sub-Division) - From Rs. 10 to Rs. 5", expected: "SPLIT" },
    { purpose: "Stock Split 1:5", expected: "SPLIT" },
    { purpose: "Bonus 1:1", expected: "BONUS" },
    { purpose: "Interim Dividend - Rs. 8 Per Share", expected: "DIVIDEND" },
    { purpose: "Final Dividend - Rs. 5 Per Share", expected: "DIVIDEND" },
    { purpose: "Annual General Meeting", expected: "UNKNOWN" },
  ];

  for (const sample of samples) {
    it(`classifies "${sample.purpose}" as ${sample.expected}`, () => {
      expect(parseCorporateActionType(sample.purpose)).toBe(sample.expected);
    });
  }

  it("extracts split ratio from Rs.X-to-Rs.Y wording", () => {
    expect(extractSplitRatio("Face Value Split (Sub-Division) - From Rs. 10 to Rs. 2")).toBe(
      "2:10",
    );
  });

  it("extracts dividend value from Rs. N Per Share wording", () => {
    expect(extractDividendValue("Interim Dividend - Rs. 8 Per Share")).toBe(8);
  });
});
