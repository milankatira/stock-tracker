import { Module } from "@nestjs/common";
import { ComplianceInterceptor } from "./compliance.interceptor";

@Module({
  providers: [ComplianceInterceptor],
  exports: [ComplianceInterceptor],
})
export class ComplianceModule {}
