import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { AccessTokenGuard } from "../../modules/auth/access-token.guard";
import { AuthenticatedUser } from "../../modules/auth/authenticated-user.decorator";
import type { AuthenticatedUser as AuthUser } from "../../modules/auth/auth.service";
import {
  EOD_CHILD_JOB_NAME,
  EOD_QUEUE_NAME,
} from "../../jobs/eod-recompute/eod-recompute.types";
import { RecomputeDto } from "./dto/recompute.dto";

export interface RecomputeResponse {
  readonly jobId: string;
  readonly status: "enqueued";
}

/**
 * Admin re-enqueue endpoint. Sits behind `AccessTokenGuard`; once an
 * admin-role check lands (Phase 1 IAM v2 follow-up), it should also
 * verify the caller has the `scoring:recompute` scope.
 *
 * Idempotency: BullMQ jobId is the deterministic
 * `${instrumentId}:${asOfDate}` — a duplicate enqueue for the same
 * day is a no-op (BullMQ rejects the second `add`).
 */
@Controller("admin/scoring")
@UseGuards(AccessTokenGuard)
export class AdminScoringController {
  constructor(@InjectQueue(EOD_QUEUE_NAME) private readonly queue: Queue) {}

  @Post("recompute")
  async recompute(
    @AuthenticatedUser() user: AuthUser,
    @Body() dto: RecomputeDto,
  ): Promise<RecomputeResponse> {
    const jobId = `${dto.instrumentId}:${dto.asOfDate}`;
    const job = await this.queue.add(
      EOD_CHILD_JOB_NAME,
      {
        instrumentId: dto.instrumentId,
        instrumentType: dto.instrumentType,
        asOfDate: dto.asOfDate,
        triggeredBy: `admin:${user.id}`,
      },
      {
        jobId,
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: { count: 500 },
      },
    );
    return { jobId: job.id ?? jobId, status: "enqueued" };
  }
}
