import { Injectable, Logger, Optional } from "@nestjs/common";
import axios, { AxiosError, type AxiosInstance } from "axios";
import { DateTime } from "luxon";
import pTimeout from "p-timeout";
import type {
  FundProvider,
  NavPoint,
  NavSnapshot,
  ProviderResult,
  SchemeMaster,
} from "@finsight/shared";
import { parseAmfiNavAll } from "./amfi.parser";

const SOURCE = "amfi";
const AMFI_URL = "https://portal.amfiindia.com/spages/NAVAll.txt";
const REQUEST_TIMEOUT_MS = 30_000;
const MIN_ROW_COUNT = 8_000;

/**
 * AMFI fallback fund provider. The NAVAll.txt snapshot only carries the
 * latest NAV for every scheme — it does NOT include history — so
 * `getNavHistory` returns a typed not-found and the Plan 02-03 fallback
 * chain knows to skip this adapter for history lookups.
 *
 * The integrity gate (`rows.length >= MIN_ROW_COUNT`) protects against
 * upstream returning a truncated body silently (AMFI occasionally
 * publishes partial files mid-day before the 9pm IST refresh).
 */
@Injectable()
export class AmfiAdapter implements FundProvider {
  private readonly logger = new Logger(AmfiAdapter.name);
  private readonly http: AxiosInstance;

  constructor(@Optional() http?: AxiosInstance) {
    this.http =
      http ??
      axios.create({
        timeout: REQUEST_TIMEOUT_MS,
        headers: { "User-Agent": "finsight-api/1.0" },
      });
  }

  async listSchemes(): Promise<ProviderResult<SchemeMaster[]>> {
    try {
      const body = await this.downloadNavAll();
      const { rows, rejected } = parseAmfiNavAll(body);
      this.logger.log(
        { provider: SOURCE, accepted: rows.length, rejected },
        "amfi_navall_parsed",
      );

      if (rows.length < MIN_ROW_COUNT) {
        this.logger.error(
          { provider: SOURCE, rows: rows.length, minimum: MIN_ROW_COUNT },
          "amfi_unexpected_low_row_count",
        );
        return {
          status: "err",
          reason: "upstream-5xx",
          message: `low row count: ${rows.length} (< ${MIN_ROW_COUNT})`,
          source: SOURCE,
        };
      }

      const masters: SchemeMaster[] = rows.map((row) => ({
        schemeCode: row.schemeCode,
        schemeName: row.schemeName,
        isinGrowth: row.isinGrowth,
        isinReinvestment: row.isinReinvestment,
      }));

      return {
        status: "ok",
        source: SOURCE,
        fetchedAt: new Date(),
        data: masters,
      };
    } catch (err) {
      return this.toErr(err, "listSchemes");
    }
  }

  async getLatestNav(
    schemeCode: string,
  ): Promise<ProviderResult<NavSnapshot>> {
    try {
      const body = await this.downloadNavAll();
      const { rows } = parseAmfiNavAll(body);
      const match = rows.find((row) => row.schemeCode === schemeCode);
      if (!match) {
        return {
          status: "err",
          reason: "not-found",
          message: `Scheme ${schemeCode} not present in AMFI snapshot`,
          source: SOURCE,
        };
      }
      const navDate = this.parseAmfiDate(match.date);
      return {
        status: "ok",
        source: SOURCE,
        fetchedAt: new Date(),
        data: {
          schemeCode: match.schemeCode,
          nav: match.nav,
          date: navDate,
        },
      };
    } catch (err) {
      return this.toErr(err, "getLatestNav");
    }
  }

  async getNavHistory(): Promise<ProviderResult<NavPoint[]>> {
    return {
      status: "err",
      reason: "not-found",
      message: "AMFI snapshot does not include NAV history — use MFAPI primary",
      source: SOURCE,
    };
  }

  private async downloadNavAll(): Promise<string> {
    const response = await pTimeout(
      this.http.get<string>(AMFI_URL, { responseType: "text" }),
      { milliseconds: REQUEST_TIMEOUT_MS },
    );
    if (typeof response.data !== "string") {
      throw new Error("AMFI response was not a text body");
    }
    return response.data;
  }

  private parseAmfiDate(value: string): Date {
    const dt = DateTime.fromFormat(value, "dd-LLL-yyyy", {
      zone: "Asia/Kolkata",
    });
    if (!dt.isValid) {
      throw new Error(`Invalid AMFI date "${value}"`);
    }
    return dt.toJSDate();
  }

  private toErr(err: unknown, operation: string): ProviderResult<never> {
    if (this.isAxiosError(err)) {
      const status = err.response?.status;
      if (status === 404) {
        return {
          status: "err",
          reason: "not-found",
          message: err.message,
          source: SOURCE,
        };
      }
      if (status === 429) {
        return {
          status: "err",
          reason: "rate-limited",
          message: err.message,
          source: SOURCE,
        };
      }
      if (typeof status === "number" && status >= 500) {
        return {
          status: "err",
          reason: "upstream-5xx",
          message: err.message,
          source: SOURCE,
        };
      }
      if (err.code === "ECONNABORTED") {
        return {
          status: "err",
          reason: "timeout",
          message: err.message,
          source: SOURCE,
        };
      }
    }
    this.logger.error(
      { provider: SOURCE, operation, message: this.errorMessage(err) },
      "amfi_unknown_error",
    );
    throw err;
  }

  private isAxiosError(err: unknown): err is AxiosError {
    return axios.isAxiosError(err);
  }

  private errorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    return "Unknown AMFI error";
  }
}
