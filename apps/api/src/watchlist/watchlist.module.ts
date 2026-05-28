import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthModule } from "../modules/auth/auth.module";
import { CacheModule } from "../modules/cache/cache.module";
import {
  Instrument,
  InstrumentSchema,
} from "../modules/market-data/instruments/instrument.schema";
import { WatchlistController } from "./watchlist.controller";
import { WatchlistService } from "./watchlist.service";
import { Watchlist, WatchlistSchema } from "./schemas/watchlist.schema";

@Module({
  imports: [
    AuthModule,
    CacheModule,
    MongooseModule.forFeature([
      { name: Watchlist.name, schema: WatchlistSchema },
      { name: Instrument.name, schema: InstrumentSchema },
    ]),
  ],
  controllers: [WatchlistController],
  providers: [WatchlistService],
  exports: [WatchlistService],
})
export class WatchlistModule {}
