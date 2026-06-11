import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Hero } from "@/components/landing/Hero";

describe("Hero (LAND-01a)", () => {
  it("renders an h1 containing 'Plain-English score'", () => {
    render(<Hero />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent ?? "").toMatch(/plain-english score/i);
  });

  it("primary CTA links exactly to /signup", () => {
    render(<Hero />);
    const primary = screen.getByRole("link", { name: /get started/i });
    expect(primary.getAttribute("href")).toBe("/signup");
  });

  it("primary CTA has a min tap-target class (min-h-11)", () => {
    render(<Hero />);
    const primary = screen.getByRole("link", { name: /get started/i });
    expect(primary.className).toContain("min-h-11");
  });

  it("secondary CTA links to #sample", () => {
    render(<Hero />);
    const secondary = screen.getByRole("link", { name: /see sample/i });
    expect(secondary.getAttribute("href")).toBe("#sample");
  });
});
