import { Controller, Get } from "@nestjs/common";
import { SHARED_SENTINEL } from "@finsight/shared";

/**
 * Root health probe used by Plan 01 to prove the @finsight/shared package
 * round-trips. The `sharedSentinel` value is imported from the shared
 * workspace and echoed to the client — both `apps/web` and `apps/api`
 * resolving the same value proves the path alias + workspace wiring is
 * functioning.
 *
 * This `/ping` endpoint will be replaced by the proper Terminus
 * `/health` + `/health/ready` routes in Plan 02 Task 3.
 */
export interface PingResponse {
  readonly ok: true;
  readonly message: "pong";
  readonly sharedSentinel: typeof SHARED_SENTINEL;
}

@Controller()
export class AppController {
  @Get("ping")
  ping(): PingResponse {
    return {
      ok: true,
      message: "pong",
      sharedSentinel: SHARED_SENTINEL,
    };
  }
}
