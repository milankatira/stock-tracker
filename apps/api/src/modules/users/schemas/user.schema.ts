import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export const UserProviderValues = ["local", "google"] as const;
export type UserProvider = (typeof UserProviderValues)[number];

@Schema({
  collection: "users",
  timestamps: true,
  versionKey: false,
})
export class User {
  @Prop({ type: String, required: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, enum: UserProviderValues, required: true })
  provider!: UserProvider;

  @Prop({ type: String, trim: true })
  providerId?: string;

  @Prop({ type: String })
  passwordHash?: string;

  @Prop({ type: Boolean, default: false })
  emailVerified!: boolean;

  @Prop({ type: Date })
  lastLoginAt?: Date;
}

export type UserDocument = HydratedDocument<User>;
export type UserRecord = User & {
  readonly _id: Types.ObjectId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index(
  { provider: 1, providerId: 1 },
  {
    unique: true,
    partialFilterExpression: { providerId: { $type: "string" } },
  },
);
