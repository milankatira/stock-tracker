import { IsString, Length, Matches } from "class-validator";

/**
 * Chat message payload. `messageId` is a client-generated nanoid used for
 * idempotent reconnect (Plan 03 dedupes on it). For the Plan 02 SSE
 * surface the controller validates `@Query` params inline; this DTO backs
 * the `@Post` body that Plan 03 adds.
 */
export class SendMessageDto {
  @IsString()
  @Length(1, 2000)
  content!: string;

  @IsString()
  @Length(1, 64)
  @Matches(/^[A-Za-z0-9_-]+$/)
  messageId!: string;
}
