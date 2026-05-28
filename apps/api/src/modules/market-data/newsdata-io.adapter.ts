import { Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosError, type AxiosInstance } from "axios";
import Bottleneck from "bottleneck";
import pTimeout from "p-timeout";
import { z } from "zod";
import type {
  NewsItem,
  NewsProvider,
  ProviderResult,
} from "@finsight/shared";
import { newsdataResponseShape, redactApiKey } from "./newsdata-io.schemas";

const SOURCE = "newsdata.io";
const BASE_URL = "https://newsdata.io/api/1/news";
const REQUEST_TIMEOUT_MS = 6_000;
const LIMITER_OPTS = { maxConcurrent: 1, minTime: 500 };
const DEFAULT_QUERY = "business india";

/**
 * Supplemental news provider. Graceful no-op when
 * `NEWSDATA_IO_API_KEY` is not configured: returns a typed
 * `rate-limited` Err without making any network call (the chain in Plan
 * 02-03 will fall through to the RSS adapter).
 */
@Injectable()
export class NewsDataIoAdapter implements NewsProvider {
  private readonly logger = new Logger(NewsDataIoAdapter.name);
  private readonly limiter = new Bottleneck(LIMITER_OPTS);
  private readonly http: AxiosInstance;

  constructor(
    private readonly config: ConfigService,
    @Optional() http?: AxiosInstance,
  ) {
    this.http =
      http ??
      axios.create({
        timeout: REQUEST_TIMEOUT_MS,
        headers: { "User-Agent": "finsight-api/1.0" },
      });
  }

  async getRecent(since: Date): Promise<ProviderResult<NewsItem[]>> {
    const apiKey = this.config.get<string>("NEWSDATA_IO_API_KEY");
    if (!apiKey || apiKey.length === 0) {
      this.logger.warn(
        { provider: SOURCE },
        "newsdata_io_api_key_not_configured",
      );
      return {
        status: "err",
        reason: "rate-limited",
        message: "NEWSDATA_IO_API_KEY not configured",
        source: SOURCE,
      };
    }

    try {
      const raw = await this.limiter.schedule(() =>
        pTimeout(
          this.http
            .get<unknown>(BASE_URL, {
              params: { apikey: apiKey, q: DEFAULT_QUERY, country: "in" },
            })
            .then((response) => response.data),
          { milliseconds: REQUEST_TIMEOUT_MS },
        ),
      );
      const parsed = newsdataResponseShape.parse(raw);
      const items: NewsItem[] = parsed.results
        .map((result) => ({
          guid: result.article_id,
          url: result.link,
          title: result.title,
          source: result.source_id,
          publishedAt: new Date(result.pubDate),
          body: result.description ?? undefined,
        }))
        .filter((item) => item.publishedAt > since);

      return {
        status: "ok",
        source: SOURCE,
        fetchedAt: new Date(),
        data: items,
      };
    } catch (err) {
      return this.toErr(err);
    }
  }

  private toErr(err: unknown): ProviderResult<never> {
    if (err instanceof z.ZodError) {
      this.logger.error(
        { provider: SOURCE, issues: err.issues },
        "newsdata_schema_validation_failed",
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
      const redactedUrl = redactApiKey(err.config?.url ?? "");
      this.logger.error(
        {
          provider: SOURCE,
          status,
          message: err.message,
          url: redactedUrl,
        },
        "newsdata_http_error",
      );
    }
    throw err;
  }

  private isAxiosError(err: unknown): err is AxiosError {
    return axios.isAxiosError(err);
  }
}
