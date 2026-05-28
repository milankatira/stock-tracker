import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const addSpy = vi.fn();
const removeSpy = vi.fn();

vi.mock("@/lib/api/watchlist", () => ({
  addWatchlistItem: (...args: unknown[]) => addSpy(...args),
  removeWatchlistItem: (...args: unknown[]) => removeSpy(...args),
  fetchWatchlist: () => Promise.resolve({ items: [] }),
}));

async function flush(ms = 0) {
  await act(async () => {
    await new Promise<void>((r) => setTimeout(r, ms));
  });
}

describe("AddToWatchlistButton", () => {
  beforeEach(() => {
    addSpy.mockReset();
    removeSpy.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it("optimistically flips to 'In watchlist' before the API resolves", async () => {
    let resolveAdd!: () => void;
    addSpy.mockImplementation(
      () => new Promise<void>((r) => (resolveAdd = r)),
    );
    const { AddToWatchlistButton } = await import("./AddToWatchlistButton");
    render(
      <AddToWatchlistButton instrumentId="iid-1" instrumentType="STOCK" />,
    );

    fireEvent.click(screen.getByRole("button"));
    expect(
      screen.getByRole("button", { name: /Remove from watchlist/i }),
    ).toBeInTheDocument();

    resolveAdd();
    await flush(0);
    expect(addSpy).toHaveBeenCalledWith({
      instrumentId: "iid-1",
      instrumentType: "STOCK",
    });
  });

  it("rolls back to the prior state when the add API rejects", async () => {
    addSpy.mockRejectedValueOnce(new Error("boom"));
    const { AddToWatchlistButton } = await import("./AddToWatchlistButton");
    render(
      <AddToWatchlistButton instrumentId="iid-1" instrumentType="STOCK" />,
    );

    fireEvent.click(screen.getByRole("button"));
    await flush(0);
    expect(
      screen.getByRole("button", { name: /Add to watchlist/i }),
    ).toBeInTheDocument();
  });

  it("calls remove API when initially in watchlist and reverts on failure", async () => {
    removeSpy.mockRejectedValueOnce(new Error("boom"));
    const { AddToWatchlistButton } = await import("./AddToWatchlistButton");
    render(
      <AddToWatchlistButton
        instrumentId="iid-1"
        instrumentType="STOCK"
        initiallyInWatchlist
      />,
    );

    fireEvent.click(screen.getByRole("button"));
    await flush(0);
    expect(removeSpy).toHaveBeenCalledWith("iid-1");
    // Reverted to 'In watchlist' after the failure
    expect(
      screen.getByRole("button", { name: /Remove from watchlist/i }),
    ).toBeInTheDocument();
  });
});
