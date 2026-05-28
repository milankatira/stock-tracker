import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { FundReturns } from "@finsight/shared";

const setDataFund = vi.fn();
const setDataBench = vi.fn();
const setDataCat = vi.fn();
const addSeries = vi.fn();
const remove = vi.fn();
const applyOptions = vi.fn();
const createChartMock = vi.fn(() => ({ addSeries, remove, applyOptions }));

function primeAddSeries(): void {
  addSeries.mockReset();
  addSeries
    .mockImplementationOnce(() => ({ setData: setDataFund }))
    .mockImplementationOnce(() => ({ setData: setDataBench }))
    .mockImplementationOnce(() => ({ setData: setDataCat }));
}

vi.mock("lightweight-charts", () => ({
  createChart: (...args: Parameters<typeof createChartMock>) =>
    createChartMock(...args),
  ColorType: { Solid: "solid" },
  LineSeries: { kind: "line" },
}));

const returns: FundReturns = {
  fund: { "1y": 18, "3y": 14, "5y": 12, "10y": 11 },
  benchmark: { "1y": 16, "3y": 13, "5y": 11, "10y": 10 },
  category: { "1y": 15, "3y": 12, "5y": 10, "10y": 9 },
};

async function flush() {
  await act(async () => {
    await new Promise<void>((r) => setTimeout(r, 0));
  });
}

describe("ReturnsChart", () => {
  beforeEach(() => {
    createChartMock.mockClear();
    setDataFund.mockClear();
    setDataBench.mockClear();
    setDataCat.mockClear();
    remove.mockClear();
    primeAddSeries();
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders the legend with Fund / Benchmark / Category", async () => {
    const { ReturnsChart } = await import("./ReturnsChart");
    render(<ReturnsChart returns={returns} />);
    expect(screen.getByText("Fund")).toBeInTheDocument();
    expect(screen.getByText("Benchmark")).toBeInTheDocument();
    expect(screen.getByText("Category")).toBeInTheDocument();
  });

  it("creates the chart once and adds three line series", async () => {
    const { ReturnsChart } = await import("./ReturnsChart");
    render(<ReturnsChart returns={returns} />);
    await flush();
    expect(createChartMock).toHaveBeenCalledTimes(1);
    expect(addSeries).toHaveBeenCalledTimes(3);
  });

  it("pushes returns data into each series on mount", async () => {
    const { ReturnsChart } = await import("./ReturnsChart");
    render(<ReturnsChart returns={returns} />);
    await flush();
    expect(setDataFund).toHaveBeenCalled();
    expect(setDataBench).toHaveBeenCalled();
    expect(setDataCat).toHaveBeenCalled();
  });

  it("calls chart.remove() on unmount", async () => {
    const { ReturnsChart } = await import("./ReturnsChart");
    const { unmount } = render(<ReturnsChart returns={returns} />);
    await flush();
    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
