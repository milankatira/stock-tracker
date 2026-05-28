import { Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthService, type AuthTokens } from "./auth.service";
import { UsersRepository } from "../users/users.repository";

export interface GoogleProfileEmail {
  readonly value: string;
  readonly verified: boolean;
}

export interface GoogleProfile {
  readonly id: string;
  readonly displayName: string;
  readonly emails?: ReadonlyArray<GoogleProfileEmail>;
}

@Injectable()
export class GoogleAuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly auth: AuthService,
  ) {}

  async signIn(profile: GoogleProfile): Promise<AuthTokens> {
    const email = this.verifiedEmail(profile);
    const user = await this.users.upsertGoogleUser({
      providerId: profile.id,
      email,
      name: profile.displayName,
      emailVerified: true,
    });

    return this.auth.issueTokens({
      userId: String(user._id),
      email: user.email,
      provider: "google",
    });
  }

  private verifiedEmail(profile: GoogleProfile): string {
    const email = profile.emails?.find((candidate) => candidate.verified)?.value;
    if (!email) {
      throw new UnauthorizedException("Google profile missing verified email");
    }
    return email.trim().toLowerCase();
  }
}
