import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiFetch,
  createSavedReport,
  fetchCurrentSession,
  getSavedReport,
  listSavedReports,
  type SavedReport,
} from "@/lib/api-client";
import { ReportWorkspace } from "./report-workspace";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
  createSavedReport: vi.fn(),
  fetchCurrentSession: vi.fn(),
  getSavedReport: vi.fn(),
  listSavedReports: vi.fn(),
}));

const unsavedReport = {
  asset: {
    name: "Reliance Industries",
    type: "stock",
    symbol: "RELIANCE.NS",
  },
  quote: {
    symbol: "RELIANCE.NS",
    price: 2450.5,
    currency: "INR",
    asOf: "2026-05-28T06:00:00.000Z",
    source: "fixture",
  },
  score: {
    score: 7,
    verdict: "STRONG_SCORE",
    insightCards: [
      { label: "Valuation", score: 72, weight: 0.2 },
      { label: "Growth", score: 68, weight: 0.2 },
    ],
  },
  citations: ["fixture quote for RELIANCE.NS as of 2026-05-28T06:00:00.000Z"],
  narrative: "Plain-English narrative",
};

function makeSavedReport(overrides: Partial<SavedReport> = {}): SavedReport {
  return {
    id: "507f1f77bcf86cd799439011",
    status: "completed",
    asset: unsavedReport.asset,
    quote: unsavedReport.quote,
    score: unsavedReport.score,
    citations: unsavedReport.citations,
    narrative: unsavedReport.narrative,
    generation: {
      requestHash: "abc",
      requestedAt: "2026-05-28T06:00:00.000Z",
      completedAt: "2026-05-28T06:00:01.000Z",
    },
    createdAt: "2026-05-28T06:00:01.000Z",
    updatedAt: "2026-05-28T06:00:01.000Z",
    ...overrides,
  } as SavedReport;
}

describe("ReportWorkspace", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(createSavedReport).mockReset();
    vi.mocked(fetchCurrentSession).mockReset();
    vi.mocked(getSavedReport).mockReset();
    vi.mocked(listSavedReports).mockReset();
  });

  it("falls back to /analysis/report when the visitor is signed out", async () => {
    vi.mocked(fetchCurrentSession).mockResolvedValue(null);
    vi.mocked(apiFetch).mockResolvedValueOnce(unsavedReport);
    render(<ReportWorkspace />);

    await screen.findByText("Sign in to keep a history of every report you generate.");

    fireEvent.change(screen.getByLabelText("Symbol"), { target: { value: "TCS" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate report" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    expect(apiFetch).toHaveBeenCalledWith(
      "/analysis/report",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"symbol":"TCS"'),
      }),
    );
    expect(createSavedReport).not.toHaveBeenCalled();
    await screen.findByText("RELIANCE.NS");
  });

  it("loads saved history and creates a saved report when authenticated", async () => {
    vi.mocked(fetchCurrentSession).mockResolvedValue({
      user: { id: "owner-1", email: "u@test.local", provider: "google" },
    });
    vi.mocked(listSavedReports).mockResolvedValue({
      items: [
        makeSavedReport({
          id: "prev-1",
          asset: { name: "Tata Motors", type: "stock", symbol: "TATAMOTORS.NS" },
        }),
      ],
      nextCursor: null,
    });
    const created = makeSavedReport({ id: "new-1" });
    vi.mocked(createSavedReport).mockResolvedValue(created);

    render(<ReportWorkspace />);

    await screen.findByText("Tata Motors");

    fireEvent.click(screen.getByRole("button", { name: "Generate report" }));

    await waitFor(() => expect(createSavedReport).toHaveBeenCalledTimes(1));
    expect(apiFetch).not.toHaveBeenCalled();
    await screen.findByText("Plain-English narrative");
    expect(screen.getAllByText("RELIANCE.NS").length).toBeGreaterThan(0);
  });

  it("loads a saved report into the detail panel when selected", async () => {
    vi.mocked(fetchCurrentSession).mockResolvedValue({
      user: { id: "owner-1", email: "u@test.local", provider: "google" },
    });
    vi.mocked(listSavedReports).mockResolvedValue({
      items: [
        makeSavedReport({
          id: "saved-2",
          asset: { name: "Infosys", type: "stock", symbol: "INFY.NS" },
        }),
      ],
      nextCursor: null,
    });
    vi.mocked(getSavedReport).mockResolvedValue(
      makeSavedReport({ id: "saved-2", narrative: "Loaded from history" }),
    );

    render(<ReportWorkspace />);

    const button = await screen.findByRole("button", { name: /Infosys/ });
    fireEvent.click(button);

    await waitFor(() => expect(getSavedReport).toHaveBeenCalledWith("saved-2"));
    await screen.findByText("Loaded from history");
  });

  it("renders an empty-history message when the user has no saved reports", async () => {
    vi.mocked(fetchCurrentSession).mockResolvedValue({
      user: { id: "owner-1", email: "u@test.local", provider: "google" },
    });
    vi.mocked(listSavedReports).mockResolvedValue({ items: [], nextCursor: null });

    render(<ReportWorkspace />);

    await screen.findByText("No saved reports yet. Generate one to start your history.");
  });

  it("renders typed API error messages on save failure", async () => {
    vi.mocked(fetchCurrentSession).mockResolvedValue({
      user: { id: "owner-1", email: "u@test.local", provider: "google" },
    });
    vi.mocked(listSavedReports).mockResolvedValue({ items: [], nextCursor: null });
    vi.mocked(createSavedReport).mockRejectedValue({
      kind: "validation",
      message: "Symbol is required",
    });

    render(<ReportWorkspace />);
    await screen.findByText("No saved reports yet. Generate one to start your history.");

    fireEvent.click(screen.getByRole("button", { name: "Generate report" }));

    await screen.findByText("Symbol is required");
  });

  it("renders the history loading state before authentication resolves", async () => {
    type SessionResolver = (value: null) => void;
    let resolveSession: SessionResolver = () => undefined;
    const pending = new Promise<null>((resolve) => {
      resolveSession = resolve;
    });
    vi.mocked(fetchCurrentSession).mockReturnValue(pending);

    render(<ReportWorkspace />);

    expect(screen.getByText("Loading your history…")).toBeTruthy();

    resolveSession(null);
    await screen.findByText("Sign in to keep a history of every report you generate.");
  });
});
