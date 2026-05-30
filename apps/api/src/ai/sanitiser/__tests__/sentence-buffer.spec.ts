import { describe, expect, it } from "vitest";
import { SentenceBuffer } from "../sentence-buffer";
import { containsForbidden } from "../forbidden-verbs";

/** Helper: feed then flush, return all emitted sentences. */
function run(...chunks: string[]): string[] {
  const b = new SentenceBuffer();
  const out: string[] = [];
  for (const c of chunks) out.push(...b.feed(c));
  out.push(...b.flush());
  return out;
}

describe("SentenceBuffer — boundaries", () => {
  it("emits a complete sentence on terminator + whitespace", () => {
    const b = new SentenceBuffer();
    expect(b.feed("Hello. ")).toEqual(["Hello."]);
  });

  it("does NOT split a decimal (7.2%)", () => {
    expect(run("FinSight Score is 7.2% as of today.")).toEqual([
      "FinSight Score is 7.2% as of today.",
    ]);
  });

  it("treats a bare single digit + '. ' as a boundary", () => {
    expect(run("P/E is 7. ", "E ratio is high.")).toEqual([
      "P/E is 7.",
      "E ratio is high.",
    ]);
  });

  it("does NOT split inside a grouped rupee number", () => {
    expect(run("₹1,23,456 is the market cap. ")).toEqual([
      "₹1,23,456 is the market cap.",
    ]);
  });

  it("does NOT split on the abbreviation 'vs.'", () => {
    expect(run("Q1 vs. Q2 results were strong. ")).toEqual([
      "Q1 vs. Q2 results were strong.",
    ]);
  });

  it("does NOT split on multiple percentages", () => {
    expect(run("Score is 7.2% YoY growth is 18%. ")).toEqual([
      "Score is 7.2% YoY growth is 18%.",
    ]);
  });

  it("flushes a terminator-less remainder", () => {
    const b = new SentenceBuffer();
    expect(b.feed("Hello")).toEqual([]);
    expect(b.flush()).toEqual(["Hello"]);
  });

  it("detects a boundary that straddles two chunks", () => {
    const b = new SentenceBuffer();
    expect(b.feed("Hello.")).toEqual([]); // terminator held, awaiting next char
    expect(b.feed(" World.")).toEqual(["Hello."]);
    expect(b.flush()).toEqual(["World."]);
  });

  it("exposes the full raw accumulated text", () => {
    const b = new SentenceBuffer();
    b.feed("One. ");
    b.feed("Two.");
    expect(b.fullText()).toBe("One. Two.");
  });
});

describe("SentenceBuffer — compliance sanitisation", () => {
  it("sanitises a forbidden sentence and flags sawForbidden", () => {
    const b = new SentenceBuffer();
    const out = [...b.feed("This is fine. "), ...b.feed("you should buy now. ")];
    expect(out[0]).toBe("This is fine.");
    expect(out[1]!.toLowerCase()).not.toMatch(/\byou should buy\b/);
    expect(b.sawForbidden).toBe(true);
    expect(containsForbidden("you should buy now.")).toBe(true);
  });

  it("accumulates a forbidden phrase split across chunks", () => {
    const b = new SentenceBuffer();
    const out = [...b.feed("you "), ...b.feed("should "), ...b.feed("buy now. ")];
    expect(out).toHaveLength(1);
    expect(out[0]!.toLowerCase()).not.toMatch(/\bbuy now\b/);
    expect(b.sawForbidden).toBe(true);
  });

  it("leaves clean sentences untouched and keeps sawForbidden false", () => {
    const b = new SentenceBuffer();
    const out = b.feed("The analysis suggests a Strong Score. ");
    expect(out).toEqual(["The analysis suggests a Strong Score."]);
    expect(b.sawForbidden).toBe(false);
  });
});
