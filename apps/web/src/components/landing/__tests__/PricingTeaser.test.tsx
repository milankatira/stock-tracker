import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PricingTeaser } from "@/components/landing/PricingTeaser";

describe("PricingTeaser (LAND-01b)", () => {
  it("renders exactly 3 tier cards (Free, Pro, Premium)", () => {
    render(<PricingTeaser />);
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByText("Premium")).toBeInTheDocument();
  });

  it("Pro and Premium each render a 'Coming soon' badge", () => {
    render(<PricingTeaser />);
    const badges = screen.getAllByText(/coming soon/i);
    expect(badges.length).toBe(2);
  });

  it("Free tier CTA links to /signup", () => {
    render(<PricingTeaser />);
    const freeCta = screen.getByRole("link", { name: /get started/i });
    expect(freeCta.getAttribute("href")).toBe("/signup");
  });

  it("Pro/Premium CTAs are disabled buttons (no href, aria-disabled=true)", () => {
    render(<PricingTeaser />);
    const notifyButtons = screen.getAllByRole("button", { name: /notify me/i });
    expect(notifyButtons.length).toBe(2);
    for (const btn of notifyButtons) {
      expect(btn.getAttribute("aria-disabled")).toBe("true");
      expect(btn.hasAttribute("href")).toBe(false);
    }
  });
});
