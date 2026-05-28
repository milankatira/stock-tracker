import { Injectable, Logger, Optional } from "@nestjs/common";
import axios, { AxiosError, type AxiosInstance } from "axios";
import Bottleneck from "bottleneck";
import { DateTime } from "luxon";
import pTimeout from "p-timeout";
import { z } from "zod";
import type {
  FundProvider,
  NavPoint,
  NavSnapshot,
  ProviderResult,
  SchemeMaster,
} from "@finsight/shared";
import {
  mfapiHistoryShape,
  mfapiLatestShape,
  mfapiSchemeListShape,
} from "./mfapi.schemas";

const SOURCE = "mfapi.in";
const BASE_URL = "https://api.mfapi.in";
const REQUEST_TIMEOUT_MS = 6_000;
const LIMITER_OPTS = { maxConcurrent: 5, minTime: 200 };

/**
 * Primary mutual-fund NAV provider. Implements the `FundProvider` port
 * from `@finsight/shared` so domain code only ever sees the abstract
 * contract.
 *
 * Pipeline per call: `Bottleneck(5 / 200ms)` → `pTimeout(6s)`.
 * Zod 4 `.parse()` at the boundary; ZodError → typed `validation` err.
 * Axios errors map to typed err reasons (404 → not-found, 5xx →
 * upstream-5xx, 429 → rate-limited, ECONNABORTED → timeout).
 */
@Injectable()
export class MfapiAdapter implements FundProvider {
  private readonly logger = new Logger(MfapiAdapter.name);
  private readonly limiter = new Bottleneck(LIMITER_OPTS);
  private readonly http: AxiosInstance;

  constructor(@Optional() http?: AxiosInstance) {
    this.http =
      http ??
      axios.create({
        baseURL: BASE_URL,
        timeout: REQUEST_TIMEOUT_MS,
        headers: { "User-Agent": "finsight-api/1.0" },
      });
  }

  async getLatestNav(
    schemeCode: string,
  ): Promise<ProviderResult<NavSnapshot>> {
    try {
      const raw = await this.invoke(async () => {
        const response = await this.http.get<unknown>(
          `/mf/${encodeURIComponent(schemeCode)}/latest`,
        );
        return response.data;
      });
      const parsed = mfapiLatestShape.parse(raw);
      const latest = parsed.data[0];
      return {
        status: "ok",
        source: SOURCE,
        fetchedAt: new Date(),
        data: {
          schemeCode: parsed.meta.scheme_code,
          nav: latest.nav,
          date: this.parseDdMmYyyy(latest.date),
        },
      };
    } catch (err) {
      return this.toErr(err, "getLatestNav", schemeCode);
    }
  }

  async getNavHistory(
    schemeCode: string,
  ): Promise<ProviderResult<NavPoint[]>> {
    try {
      const raw = await this.invoke(async () => {
        const response = await this.http.get<unknown>(
          `/mf/${encodeURIComponent(schemeCode)}`,
        );
        return response.data;
      });
      const parsed = mfapiHistoryShape.parse(raw);
      const points: NavPoint[] = parsed.data
        .map((row) => ({
          ts: this.parseDdMmYyyy(row.date),
          nav: row.nav,
        }))
        .sort((a, b) => a.ts.getTime() - b.ts.getTime());
      return {
        status: "ok",
        source: SOURCE,
        fetchedAt: new Date(),
        data: points,
      };
    } catch (err) {
      return this.toErr(err, "getNavHistory", schemeCode);
    }
  }

  async listSchemes(): Promise<ProviderResult<SchemeMaster[]>> {
    try {
      const raw = await this.invoke(async () => {
        const response = await this.http.get<unknown>("/mf");
        return response.data;
      });
      const parsed = mfapiSchemeListShape.parse(raw);
      const masters: SchemeMaster[] = parsed.map((entry) => ({
        schemeCode: entry.schemeCode,
        schemeName: entry.schemeName,
        isinGrowth: this.nullableIsin(entry.isinGrowth),
        isinReinvestment: this.nullableIsin(entry.isinDivReinvestment),
      }));
      return {
        status: "ok",
        source: SOURCE,
        fetchedAt: new Date(),
        data: masters,
      };
    } catch (err) {
      return this.toErr(err, "listSchemes", undefined);
    }
  }

  private parseDdMmYyyy(value: string): Date {
    const dt = DateTime.fromFormat(value, "dd-MM-yyyy", {
      zone: "Asia/Kolkata",
    });
    if (!dt.isValid) {
      throw new z.ZodError([
        {
          code: "custom",
          path: ["date"],
          message: `Invalid MFAPI date "${value}"`,
          input: value,
        },
      ]);
    }
    return dt.toJSDate();
  }

  private nullableIsin(value: string | null | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed === "-") return null;
    return trimmed;
  }

  private async invoke<T>(fn: () => Promise<T>): Promise<T> {
    return this.limiter.schedule(() =>
      pTimeout(fn(), { milliseconds: REQUEST_TIMEOUT_MS }),
    );
  }

  private toErr(
    err: unknown,
    operation: string,
    schemeCode: string | undefined,
  ): ProviderResult<never> {
    if (err instanceof z.ZodError) {
      this.logger.error(
        { provider: SOURCE, operation, schemeCode, issues: err.issues },
        "mfapi_schema_validation_failed",
      );
      return {
        status: "err",
        reason: "validation",
        message: err.message,
        source: SOURCE,
      };
    }
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
    throw err;
  }

  private isAxiosError(err: unknown): err is AxiosError {
    return axios.isAxiosError(err);
  }
}
