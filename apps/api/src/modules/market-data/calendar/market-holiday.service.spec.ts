import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { MarketHolidayService } from "./market-holiday.service";

const service = new MarketHolidayService();

function ist(iso: string): DateTime {
  return DateTime.fromISO(iso, { zone: "Asia/Kolkata" });
}

describe("MarketHolidayService.isTradingDay", () => {
  it("returns false on a Saturday", () => {
    expect(service.isTradingDay(ist("2026-05-30T10:00:00"))).toBe(false);
  });

  it("returns false on a Sunday", () => {
    expect(service.isTradingDay(ist("2026-05-31T10:00:00"))).toBe(false);
  });

  it("returns false on Republic Day 2026", () => {
    expect(service.isTradingDay(ist("2026-01-26T10:00:00"))).toBe(false);
  });

  it("returns false on Diwali Laxmi Pujan 2026", () => {
    expect(service.isTradingDay(ist("2026-11-09T10:00:00"))).toBe(false);
  });

  it("returns true on a normal weekday with no holiday", () => {
    expect(service.isTradingDay(ist("2026-05-20T10:00:00"))).toBe(true);
  });

  it("uses the 2027 calendar for cross-year queries", () => {
    expect(service.isTradingDay(ist("2027-04-14T10:00:00"))).toBe(false);
    expect(service.isTradingDay(ist("2027-04-15T10:00:00"))).toBe(true);
  });
});

describe("MarketHolidayService.isInTradingSession", () => {
  it("returns true inside the 09:15-15:30 IST window on a trading day", () => {
    expect(service.isInTradingSession(ist("2026-05-20T10:30:00"))).toBe(true);
    expect(service.isInTradingSession(ist("2026-05-20T15:30:00"))).toBe(true);
  });

  it("returns false in the pre-open window on a trading day", () => {
    expect(service.isInTradingSession(ist("2026-05-20T09:00:00"))).toBe(false);
  });

  it("returns false after market close on a trading day", () => {
    expect(service.isInTradingSession(ist("2026-05-20T15:31:00"))).toBe(false);
  });

  it("returns false at any time on a regular holiday", () => {
    expect(service.isInTradingSession(ist("2026-01-26T10:30:00"))).toBe(false);
  });

  it("returns true during the Diwali Muhurat session window", () => {
    expect(service.isInTradingSession(ist("2026-11-09T18:30:00"))).toBe(true);
  });

  it("returns false outside the Muhurat session window on Diwali", () => {
    expect(service.isInTradingSession(ist("2026-11-09T10:30:00"))).toBe(false);
    expect(service.isInTradingSession(ist("2026-11-09T19:30:00"))).toBe(false);
  });
});
