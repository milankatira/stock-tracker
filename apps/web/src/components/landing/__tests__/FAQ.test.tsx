import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FAQ } from "@/components/landing/FAQ";

describe("FAQ (LAND-01c)", () => {
  it("renders at least 6 accordion items", () => {
    render(<FAQ />);
    const triggers = screen.getAllByRole("button", { expanded: false });
    expect(triggers.length).toBeGreaterThanOrEqual(6);
  });

  it("clicking a closed item sets aria-expanded=true and reveals its answer", async () => {
    const user = userEvent.setup();
    render(<FAQ />);
    const trigger = screen.getByRole("button", {
      name: /what is the finsight score/i,
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await user.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/deterministic 1.10 score/i)).toBeInTheDocument();
  });

  it("keyboard Enter on a trigger toggles the panel", async () => {
    const user = userEvent.setup();
    render(<FAQ />);
    const trigger = screen.getByRole("button", {
      name: /is this investment advice/i,
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    await user.keyboard("{Enter}");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});
