import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";

const NAMESPACE_EXISTS_CODE = 48;

/**
 * Idempotent `createCollection` for the `score_history` time-series
 * collection. We do this explicitly (rather than relying on Mongoose
 * auto-create) because the driver's auto-create path does not always
 * honour the `timeseries` configuration on first insert.
 */
@Injectable()
export class ScoreHistoryBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(ScoreHistoryBootstrap.name);

  constructor(@InjectConnection() private readonly conn: Connection) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensure();
  }

  /** Direct entrypoint for integration tests that don't run the Nest lifecycle. */
  async ensure(): Promise<void> {
    const db = this.conn.db;
    if (!db) {
      this.logger.warn(
        { module: "ScoreHistoryBootstrap" },
        "no_active_mongoose_connection",
      );
      return;
    }
    try {
      await db.createCollection("score_history", {
        timeseries: {
          timeField: "computedAt",
          metaField: "instrumentId",
          granularity: "hours",
        },
        expireAfterSeconds: 60 * 60 * 24 * 365 * 3,
      });
      this.logger.log("score_history time-series collection created");
    } catch (err: unknown) {
      const candidate = err as {
        code?: number;
        codeName?: string;
        message?: string;
      };
      if (
        candidate.code === NAMESPACE_EXISTS_CODE ||
        candidate.codeName === "NamespaceExists"
      ) {
        this.logger.log("score_history exists — skipping create");
        return;
      }
      throw err;
    }
  }
}
