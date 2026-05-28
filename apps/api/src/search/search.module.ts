import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthModule } from "../modules/auth/auth.module";
import {
  Instrument,
  InstrumentSchema,
} from "../modules/market-data/instruments/instrument.schema";
import {
  FundReportDocEntity,
  FundReportDocSchema,
} from "../reports/schemas/fund-report-doc.schema";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Instrument.name, schema: InstrumentSchema },
      { name: FundReportDocEntity.name, schema: FundReportDocSchema },
    ]),
  ],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
