import { describe, expect, it } from "vitest";
import { tagMentions, type InstrumentEntry } from "./ticker-tagger";

const ADANI_INSTRUMENTS: readonly InstrumentEntry[] = [
  {
    instrumentId: "adani-ent",
    symbol: "ADANIENT",
    name: "Adani Enterprises",
    group: "ADANI",
    groupAliases: ["Adani"],
  },
  {
    instrumentId: "adani-ports",
    symbol: "ADANIPORTS",
    name: "Adani Ports and SEZ",
    group: "ADANI",
    groupAliases: ["Adani"],
  },
  {
    instrumentId: "adani-green",
    symbol: "ADANIGREEN",
    name: "Adani Green Energy",
    group: "ADANI",
    groupAliases: ["Adani"],
  },
];

const TATA_INSTRUMENTS: readonly InstrumentEntry[] = [
  {
    instrumentId: "tatamotors",
    symbol: "TATAMOTORS",
    name: "Tata Motors",
    group: "TATA",
    groupAliases: ["Tata"],
  },
  {
    instrumentId: "tatasteel",
    symbol: "TATASTEEL",
    name: "Tata Steel",
    group: "TATA",
    groupAliases: ["Tata"],
  },
];

const STANDALONE_INFY: InstrumentEntry = {
  instrumentId: "infy",
  symbol: "INFY",
  name: "Infosys",
};

describe("tagMentions", () => {
  it("returns a single specific match when one instrument owns the headline", () => {
    const r = tagMentions("Tata Motors Q4 profit jumps 30%", TATA_INSTRUMENTS);
    expect(r.instrumentMentions).toEqual(["tatamotors"]);
    expect(r.groupLevel).toBeUndefined();
    expect(r.needsLlmFallback).toBe(false);
  });

  it("does not over-attribute to all Adani instruments when the headline mentions only the group brand", () => {
    const r = tagMentions(
      "Adani Group denies Hindenburg allegations",
      ADANI_INSTRUMENTS,
    );
    expect(r.instrumentMentions).toEqual([]);
    expect(r.groupLevel).toBe("ADANI");
    expect(r.needsLlmFallback).toBe(true);
  });

  it("returns the specific Adani sibling when the headline names it explicitly", () => {
    const r = tagMentions(
      "Adani Ports container volume hits new high",
      ADANI_INSTRUMENTS,
    );
    expect(r.instrumentMentions).toEqual(["adani-ports"]);
    expect(r.groupLevel).toBeUndefined();
  });

  it("matches symbols even when the brand alias is absent", () => {
    const r = tagMentions("INFY beats Street estimates", [STANDALONE_INFY]);
    expect(r.instrumentMentions).toEqual(["infy"]);
  });

  it("returns no mentions for a generic macro headline", () => {
    const r = tagMentions("Crude oil rallies on OPEC cut", [
      STANDALONE_INFY,
      ...TATA_INSTRUMENTS,
    ]);
    expect(r.instrumentMentions).toEqual([]);
    expect(r.groupLevel).toBeUndefined();
  });

  it("is case insensitive on the symbol match", () => {
    const r = tagMentions("infy revises guidance", [STANDALONE_INFY]);
    expect(r.instrumentMentions).toEqual(["infy"]);
  });
});
