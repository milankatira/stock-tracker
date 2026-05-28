import { Injectable, Logger } from "@nestjs/common";
import CircuitBreaker from "opossum";

export interface BreakerOptions {
  readonly name: string;
  readonly timeoutMs?: number;
  readonly errorThresholdPercentage?: number;
  readonly resetTimeoutMs?: number;
}

const DEFAULT_OPTIONS = {
  timeoutMs: 8_000,
  errorThresholdPercentage: 50,
  resetTimeoutMs: 30_000,
  rollingCountTimeoutMs: 60_000,
  rollingCountBuckets: 10,
};

/**
 * Produces one `opossum 9` circuit breaker per provider-per-method so a
 * single misbehaving endpoint (e.g. Yahoo `quote`) does not open the
 * circuit for sibling methods (e.g. Yahoo `historical`).
 *
 * Lifecycle events are hooked up to the Nest logger so production
 * observability gets structured open / halfOpen / close transitions.
 */
@Injectable()
export class CircuitBreakerFactory {
  private readonly logger = new Logger(CircuitBreakerFactory.name);
  private readonly breakers = new Map<string, CircuitBreaker<unknown[], unknown>>();

  /**
   * Get or create a breaker keyed by `name`. The first call defines the
   * wrapped function; subsequent calls with the same name return the
   * existing instance (callers must keep using the same `fn`).
   */
  forAction<T extends unknown[], R>(
    options: BreakerOptions,
    fn: (...args: T) => Promise<R>,
  ): CircuitBreaker<T, R> {
    const existing = this.breakers.get(options.name);
    if (existing) {
      return existing as unknown as CircuitBreaker<T, R>;
    }
    const breaker = new CircuitBreaker<T, R>(fn, {
      timeout: options.timeoutMs ?? DEFAULT_OPTIONS.timeoutMs,
      errorThresholdPercentage:
        options.errorThresholdPercentage ??
        DEFAULT_OPTIONS.errorThresholdPercentage,
      resetTimeout: options.resetTimeoutMs ?? DEFAULT_OPTIONS.resetTimeoutMs,
      rollingCountTimeout: DEFAULT_OPTIONS.rollingCountTimeoutMs,
      rollingCountBuckets: DEFAULT_OPTIONS.rollingCountBuckets,
    });

    breaker.on("open", () =>
      this.logger.warn({ breaker: options.name }, "circuit_open"),
    );
    breaker.on("halfOpen", () =>
      this.logger.log({ breaker: options.name }, "circuit_half_open"),
    );
    breaker.on("close", () =>
      this.logger.log({ breaker: options.name }, "circuit_close"),
    );
    breaker.on("reject", () =>
      this.logger.warn({ breaker: options.name }, "circuit_reject"),
    );
    breaker.on("timeout", () =>
      this.logger.warn({ breaker: options.name }, "circuit_timeout"),
    );

    this.breakers.set(options.name, breaker as unknown as CircuitBreaker<unknown[], unknown>);
    return breaker;
  }

  /** Visible for tests / health checks. */
  list(): ReadonlyArray<{
    readonly name: string;
    readonly state: "open" | "halfOpen" | "closed";
  }> {
    return [...this.breakers.entries()].map(([name, breaker]) => ({
      name,
      state: breaker.opened
        ? "open"
        : breaker.halfOpen
          ? "halfOpen"
          : "closed",
    }));
  }
}
