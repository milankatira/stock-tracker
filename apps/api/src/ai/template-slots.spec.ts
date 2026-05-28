import { describe, expect, it } from "vitest";
import { UnknownPlaceholderError, substituteSlots } from "./template-slots";

describe("substituteSlots", () => {
  it("replaces a single placeholder", () => {
    expect(substituteSlots("Score is {{score}}.", { score: "7" })).toBe(
      "Score is 7.",
    );
  });

  it("replaces multiple distinct placeholders", () => {
    expect(
      substituteSlots("{{a}} and {{b}}", { a: "1", b: "2" }),
    ).toBe("1 and 2");
  });

  it("replaces multiple occurrences of the same placeholder", () => {
    expect(
      substituteSlots("{{a}} then {{a}} again", { a: "X" }),
    ).toBe("X then X again");
  });

  it("returns input unchanged when there are no placeholders", () => {
    expect(substituteSlots("Plain text.", { a: "X" })).toBe("Plain text.");
  });

  it("throws UnknownPlaceholderError for an unknown placeholder", () => {
    expect(() =>
      substituteSlots("{{unknown}}", { score: "7" }),
    ).toThrowError(UnknownPlaceholderError);
  });

  it("UnknownPlaceholderError carries the offending key", () => {
    try {
      substituteSlots("{{unknown}}", { score: "7" });
      throw new Error("should not reach");
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownPlaceholderError);
      expect((err as UnknownPlaceholderError).placeholder).toBe("unknown");
    }
  });

  it("tolerates whitespace inside the braces", () => {
    expect(substituteSlots("{{ score }}", { score: "7" })).toBe("7");
  });

  it("returns empty string for empty input", () => {
    expect(substituteSlots("", { score: "7" })).toBe("");
  });
});
