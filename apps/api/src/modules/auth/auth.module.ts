import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AccessTokenGuard } from "./access-token.guard";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { GoogleAuthService } from "./google-auth.service";
import { UsersModule } from "../users/users.module";

@Module({
  imports: [ConfigModule, UsersModule],
  controllers: [AuthController],
  providers: [AuthService, GoogleAuthService, AccessTokenGuard],
  exports: [AuthService, GoogleAuthService, AccessTokenGuard],
})
export class AuthModule {}
