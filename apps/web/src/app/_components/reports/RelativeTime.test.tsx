import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RelativeTime, formatRelative } from "./RelativeTime";

const NOW = new Date("2026-05-30T12:00:00.000Z").getTime();

describe("formatRelative", () => {
  it("returns 'just now' for sub-minute deltas", () => {
    expect(formatRelative(new Date(NOW - 5_000).toISOString(), NOW)).toBe("just now");
  });

  it("formats hours ago", () => {
    expect(formatRelative(new Date(NOW - 2 * 3_600_000).toISOString(), NOW)).toBe(
      "2 hours ago",
    );
  });

  it("formats days ago", () => {
    expect(formatRelative(new Date(NOW - 3 * 86_400_000).toISOString(), NOW)).toBe(
      "3 days ago",
    );
  });

  it("returns empty string for an invalid date", () => {
    expect(formatRelative("not-a-date", NOW)).toBe("");
  });
});

describe("RelativeTime", () => {
  it("renders a semantic <time> element with the machine-readable dateTime", () => {
    // Component formats against real Date.now(); use a past iso relative to now.
    const iso = new Date(Date.now() - 3_600_000).toISOString();
    render(<RelativeTime iso={iso} />);
    const el = screen.getByText(/ago|just now/);
    expect(el.tagName).toBe("TIME");
    expect(el).toHaveAttribute("dateTime", iso);
  });
});
