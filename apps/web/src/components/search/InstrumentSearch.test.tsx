import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { InstrumentMatch } from "@finsight/shared";

const searchSpy = vi.fn();

vi.mock("@/lib/api/search", () => ({
  searchInstruments: (...args: unknown[]) => searchSpy(...args),
}));

const stock: InstrumentMatch = {
  id: "s1",
  type: "STOCK",
  symbol: "RELIANCE",
  name: "Reliance Industries Limited",
  exchange: "NSE",
  score: 100,
};

const fund: InstrumentMatch = {
  id: "f1",
  type: "FUND",
  symbol: "120503",
  name: "Axis Bluechip Fund",
  exchange: "AMFI",
  score: 60,
};

async function flush(ms = 0) {
  await act(async () => {
    await new Promise<void>((r) => setTimeout(r, ms));
  });
}

describe("InstrumentSearch", () => {
  beforeEach(() => {
    searchSpy.mockReset();
    searchSpy.mockResolvedValue([stock, fund]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("does NOT fire searchInstruments for queries shorter than 2 chars", async () => {
    const { InstrumentSearch } = await import("./InstrumentSearch");
    render(<InstrumentSearch onSelect={() => {}} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "r" } });
    await flush(300);
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it("debounces rapid keystrokes into a single search call", async () => {
    const { InstrumentSearch } = await import("./InstrumentSearch");
    render(<InstrumentSearch onSelect={() => {}} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "r" } });
    fireEvent.change(input, { target: { value: "re" } });
    fireEvent.change(input, { target: { value: "rel" } });
    await flush(300);
    expect(searchSpy).toHaveBeenCalledTimes(1);
    expect(searchSpy).toHaveBeenCalledWith("rel", expect.any(Object));
  });

  it("renders Stocks and Mutual Funds groups separately", async () => {
    const { InstrumentSearch } = await import("./InstrumentSearch");
    render(<InstrumentSearch onSelect={() => {}} />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "axis" } });
    await flush(300);
    expect(screen.getByText("Stocks")).toBeInTheDocument();
    expect(screen.getByText("Mutual Funds")).toBeInTheDocument();
    expect(screen.getByText("RELIANCE")).toBeInTheDocument();
    expect(screen.getByText("Axis Bluechip Fund")).toBeInTheDocument();
  });

  it("calls onSelect with the chosen match", async () => {
    const onSelect = vi.fn();
    const { InstrumentSearch } = await import("./InstrumentSearch");
    render(<InstrumentSearch onSelect={onSelect} />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "axis" } });
    await flush(300);
    fireEvent.mouseDown(screen.getByText("Axis Bluechip Fund"));
    expect(onSelect).toHaveBeenCalledWith(fund);
  });

  it("shows a no-results affordance when the server returns []", async () => {
    searchSpy.mockResolvedValueOnce([]);
    const { InstrumentSearch } = await import("./InstrumentSearch");
    render(<InstrumentSearch onSelect={() => {}} />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "zzzz" } });
    await flush(300);
    expect(
      screen.getByText('No instruments match "zzzz"'),
    ).toBeInTheDocument();
  });
});
