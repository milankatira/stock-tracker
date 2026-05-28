import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const fetchSpy = vi.fn();
const removeSpy = vi.fn();

vi.mock("@/lib/api/watchlist", () => ({
  fetchWatchlist: (...args: unknown[]) => fetchSpy(...args),
  removeWatchlistItem: (...args: unknown[]) => removeSpy(...args),
  addWatchlistItem: vi.fn(),
}));

async function flush(ms = 0) {
  await act(async () => {
    await new Promise<void>((r) => setTimeout(r, ms));
  });
}

const sample = [
  {
    instrumentId: "i-strong",
    instrumentType: "STOCK" as const,
    addedAt: "2026-05-01T00:00:00.000Z",
    latestScore: 8.2,
    previousScore: 7.5,
    delta: 0.7,
  },
  {
    instrumentId: "i-weak",
    instrumentType: "FUND" as const,
    addedAt: "2026-05-15T00:00:00.000Z",
    latestScore: 3.4,
    previousScore: 3.4,
    delta: 0,
  },
  {
    instrumentId: "i-unknown",
    instrumentType: "STOCK" as const,
    addedAt: "2026-05-20T00:00:00.000Z",
    latestScore: null,
    previousScore: null,
    delta: null,
  },
];

describe("WatchlistTable", () => {
  beforeEach(() => {
    fetchSpy.mockReset();
    removeSpy.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders the empty state with a search CTA when the API returns no items", async () => {
    fetchSpy.mockResolvedValueOnce({ items: [] });
    const { WatchlistTable } = await import("./WatchlistTable");
    render(<WatchlistTable />);
    await flush(0);
    expect(screen.getByText("Your watchlist is empty.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Search for instruments/i }),
    ).toHaveAttribute("href", "/search");
  });

  it("renders one row per item with the score badge and a delta indicator", async () => {
    fetchSpy.mockResolvedValueOnce({ items: sample });
    const { WatchlistTable } = await import("./WatchlistTable");
    render(<WatchlistTable />);
    await flush(0);

    expect(screen.getByText("8.2")).toBeInTheDocument();
    expect(screen.getByText("3.4")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByLabelText("Score up")).toBeInTheDocument();
  });

  it("removes a row optimistically and restores it when the API fails", async () => {
    fetchSpy.mockResolvedValueOnce({ items: sample });
    removeSpy.mockRejectedValueOnce(new Error("boom"));
    const { WatchlistTable } = await import("./WatchlistTable");
    render(<WatchlistTable />);
    await flush(0);

    const removeButtons = screen.getAllByRole("button", {
      name: /Remove from watchlist/i,
    });
    fireEvent.click(removeButtons[0]);
    // Optimistic: 8.2 row gone immediately.
    expect(screen.queryByText("8.2")).toBeNull();
    await flush(0);
    // Restored after the API rejection.
    expect(screen.getByText("8.2")).toBeInTheDocument();
  });
});
