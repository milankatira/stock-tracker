import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { User, type UserDocument, type UserProvider, type UserRecord } from "./schemas/user.schema";

export interface CreateUserInput {
  readonly email: string;
  readonly name: string;
  readonly provider: UserProvider;
  readonly providerId?: string;
  readonly passwordHash?: string;
  readonly emailVerified: boolean;
}

export interface UpsertGoogleUserInput {
  readonly email: string;
  readonly name: string;
  readonly providerId: string;
  readonly emailVerified: boolean;
}

@Injectable()
export class UsersRepository {
  constructor(@InjectModel(User.name) private readonly users: Model<UserDocument>) {}

  async create(input: CreateUserInput): Promise<UserRecord> {
    const created = await this.users.create({
      ...input,
      email: this.normalizeEmail(input.email),
    });
    const user = await this.findById(created.id);
    if (!user) {
      throw new Error("UsersRepository.create: created user not found");
    }
    return user;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.users.findOne({ email: this.normalizeEmail(email) }).lean<UserRecord>().exec();
  }

  async findByProvider(
    provider: UserProvider,
    providerId: string,
  ): Promise<UserRecord | null> {
    return this.users.findOne({ provider, providerId }).lean<UserRecord>().exec();
  }

  async upsertGoogleUser(input: UpsertGoogleUserInput): Promise<UserRecord> {
    const user = await this.users
      .findOneAndUpdate(
        { provider: "google", providerId: input.providerId },
        {
          $set: {
            email: this.normalizeEmail(input.email),
            name: input.name,
            emailVerified: input.emailVerified,
            lastLoginAt: new Date(),
          },
          $setOnInsert: {
            provider: "google",
            providerId: input.providerId,
          },
        },
        { returnDocument: "after", upsert: true },
      )
      .lean<UserRecord>()
      .exec();

    if (!user) {
      throw new Error("UsersRepository.upsertGoogleUser: upsert returned no user");
    }
    return user;
  }

  private async findById(id: string): Promise<UserRecord | null> {
    return this.users.findById(id).lean<UserRecord>().exec();
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
