import { describe, expect, it } from "vitest";
import {
  applyReplacements,
  containsForbidden,
} from "../forbidden-verbs";

describe("containsForbidden", () => {
  it.each([
    "you should buy this",
    "I recommend HDFC Bank",
    "guaranteed returns of 12%",
    "target price is ₹3000",
    "should I sell RELIANCE",
  ])("flags %s", (text) => {
    expect(containsForbidden(text)).toBe(true);
  });

  it.each([
    "the analysis shows a Strong Score",
    "a new buyer entered the market",
    "the FinSight Score is 7.2",
  ])("passes clean text: %s", (text) => {
    expect(containsForbidden(text)).toBe(false);
  });
});

describe("applyReplacements", () => {
  it("removes 'buy' and the 'you should buy' phrase", () => {
    const out = applyReplacements("you should buy this stock");
    expect(out.toLowerCase()).not.toMatch(/\byou should buy\b/);
    expect(out.toLowerCase()).not.toMatch(/\bbuy\b/);
  });

  it("rewrites 'recommend' to analysis framing", () => {
    expect(applyReplacements("I recommend HDFC")).not.toMatch(/recommend/i);
  });
});
