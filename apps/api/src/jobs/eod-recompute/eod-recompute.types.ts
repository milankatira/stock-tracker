/**
 * BullMQ payload contracts for the EOD recompute pipeline. Kept in a
 * separate module so the processor + producer + tests + admin
 * controller all reference the same canonical shapes.
 */

export const EOD_QUEUE_NAME = "eod-recompute";
export const EOD_PARENT_JOB_NAME = "eod-recompute-parent";
export const EOD_CHILD_JOB_NAME = "eod-recompute-child";
export const EOD_SCHEDULER_KEY = "eod-recompute-daily";

export interface EodChildPayload {
  readonly instrumentId: string;
  readonly instrumentType: "STOCK" | "FUND";
  readonly asOfDate: string;
  /** `'cron'` for the nightly fan-out, `'admin:{userId}'` for manual recomputes. */
  readonly triggeredBy: string;
}

export interface EodParentPayload {
  readonly asOfDate?: string;
  readonly triggeredBy?: string;
}

export interface ActiveInstrument {
  readonly id: string;
  readonly type: "STOCK" | "FUND";
}
