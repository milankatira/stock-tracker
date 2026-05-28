import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const setData = vi.fn();
const addSeries = vi.fn(() => ({ setData }));
const remove = vi.fn();
const applyOptions = vi.fn();
const createChartMock = vi.fn(() => ({
  addSeries,
  remove,
  applyOptions,
}));

vi.mock("lightweight-charts", () => ({
  createChart: (...args: Parameters<typeof createChartMock>) =>
    createChartMock(...args),
  ColorType: { Solid: "solid" },
  CandlestickSeries: { kind: "candlestick" },
}));

async function flush(ms: number): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  });
}

describe("PriceChart", () => {
  beforeEach(() => {
    createChartMock.mockClear();
    addSeries.mockClear();
    setData.mockClear();
    remove.mockClear();
    applyOptions.mockClear();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([{ time: 1, open: 1, high: 2, low: 0.5, close: 1.5 }]),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the timeframe button row with 1Y selected by default", async () => {
    const { PriceChart } = await import("./PriceChart");
    render(<PriceChart ticker="RELIANCE" />);
    const buttons = screen.getAllByRole("tab");
    expect(buttons.map((b) => b.textContent)).toEqual([
      "1D",
      "1W",
      "1M",
      "6M",
      "1Y",
      "5Y",
      "MAX",
    ]);
    expect(
      buttons.find((b) => b.textContent === "1Y")?.getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("creates the chart once on mount and removes it on unmount", async () => {
    const { PriceChart } = await import("./PriceChart");
    const { unmount } = render(<PriceChart ticker="RELIANCE" />);
    await flush(0);
    expect(createChartMock).toHaveBeenCalledTimes(1);
    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("switches timeframe via setData (no chart re-creation)", async () => {
    const { PriceChart } = await import("./PriceChart");
    render(<PriceChart ticker="RELIANCE" />);
    await flush(250);
    setData.mockClear();

    fireEvent.click(screen.getByRole("tab", { name: "1M" }));
    await flush(250);

    expect(createChartMock).toHaveBeenCalledTimes(1);
    expect(setData).toHaveBeenCalled();
  });

  it("debounces rapid clicks: only the final tf is fetched within 150ms", async () => {
    const { PriceChart } = await import("./PriceChart");
    render(<PriceChart ticker="RELIANCE" />);
    await flush(250);
    (global.fetch as ReturnType<typeof vi.fn>).mockClear();

    fireEvent.click(screen.getByRole("tab", { name: "1D" }));
    fireEvent.click(screen.getByRole("tab", { name: "1W" }));
    fireEvent.click(screen.getByRole("tab", { name: "5Y" }));
    await flush(250);

    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("tf=5Y");
  });

  it("applies width on window resize after mount", async () => {
    const { PriceChart } = await import("./PriceChart");
    render(<PriceChart ticker="RELIANCE" />);
    await flush(0);
    fireEvent(window, new Event("resize"));
    expect(applyOptions).toHaveBeenCalled();
  });
});
