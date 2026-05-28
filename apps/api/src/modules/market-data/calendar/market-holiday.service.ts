import { Injectable } from "@nestjs/common";
import { DateTime } from "luxon";
import holidays2026 from "./nse-holidays-2026.json";
import holidays2027 from "./nse-holidays-2027.json";

export type HolidayType = "TRADING_HOLIDAY" | "MUHURAT_SESSION";

interface HolidayEntry {
  readonly date: string;
  readonly name: string;
  readonly type: HolidayType;
  readonly from?: string;
  readonly to?: string;
}

interface HolidayFile {
  readonly year: number;
  readonly timezone: string;
  readonly source: string;
  readonly holidays: readonly HolidayEntry[];
}

const FILES: readonly HolidayFile[] = [
  holidays2026 as HolidayFile,
  holidays2027 as HolidayFile,
];

const IST = "Asia/Kolkata";
const MARKET_OPEN_MINUTES = 9 * 60 + 15; // 09:15 IST
const MARKET_CLOSE_MINUTES = 15 * 60 + 30; // 15:30 IST

/**
 * NSE equity trading calendar. Backed by static JSON files so the runtime
 * never has to hit an external feed. The 2027 list is provisional —
 * refresh in December 2026 once NSE publishes the official calendar.
 *
 * - `isTradingDay(date)` accounts for weekends + published holidays.
 * - `isInTradingSession(now)` checks the 09:15–15:30 IST window on a
 *   trading day, and the special Muhurat one-hour window on Diwali.
 */
@Injectable()
export class MarketHolidayService {
  private readonly tradingHolidays = new Set<string>();
  private readonly muhuratByDate = new Map<
    string,
    { from: string; to: string }
  >();

  constructor() {
    for (const file of FILES) {
      for (const entry of file.holidays) {
        if (entry.type === "TRADING_HOLIDAY") {
          this.tradingHolidays.add(entry.date);
        } else if (
          entry.type === "MUHURAT_SESSION" &&
          entry.from &&
          entry.to
        ) {
          this.muhuratByDate.set(entry.date, {
            from: entry.from,
            to: entry.to,
          });
        }
      }
    }
  }

  isTradingDay(value: Date | DateTime): boolean {
    const dt = this.toIst(value);
    if (dt.weekday === 6 || dt.weekday === 7) return false;
    const iso = dt.toISODate();
    if (!iso) return false;
    return !this.tradingHolidays.has(iso);
  }

  isInTradingSession(value: Date | DateTime): boolean {
    const dt = this.toIst(value);
    const iso = dt.toISODate();
    if (!iso) return false;

    const muhurat = this.muhuratByDate.get(iso);
    if (muhurat) {
      const open = this.dateAt(dt, muhurat.from);
      const close = this.dateAt(dt, muhurat.to);
      if (open && close && dt >= open && dt <= close) return true;
    }

    if (!this.isTradingDay(dt)) return false;
    const minutes = dt.hour * 60 + dt.minute;
    return (
      minutes >= MARKET_OPEN_MINUTES && minutes <= MARKET_CLOSE_MINUTES
    );
  }

  private toIst(value: Date | DateTime): DateTime {
    if (value instanceof Date) {
      return DateTime.fromJSDate(value, { zone: IST });
    }
    return value.setZone(IST);
  }

  private dateAt(base: DateTime, hhmm: string): DateTime | null {
    const [hh, mm] = hhmm.split(":").map((part) => Number.parseInt(part, 10));
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return base.set({ hour: hh, minute: mm, second: 0, millisecond: 0 });
  }
}
