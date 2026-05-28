import { Controller, Get } from "@nestjs/common";
import { HealthCheck, type HealthCheckResult } from "@nestjs/terminus";
import { HealthService, type LivenessResponse } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  live(): LivenessResponse {
    return this.health.live();
  }

  @Get("ready")
  @HealthCheck()
  ready(): Promise<HealthCheckResult> {
    return this.health.ready();
  }
}
