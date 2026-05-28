---
phase: 07-ask-finsight-chat-comparison
plan: 03
type: execute
wave: 3
depends_on: ["07-01", "07-02"]
autonomous: true
requirements: [CHAT-03, CHAT-05]
files_modified:
  - apps/api/src/ai/sanitiser/citation-validator.ts
  - apps/api/src/ai/sanitiser/__tests__/citation-validator.spec.ts
  - apps/api/src/chat/chat-session.schema.ts
  - apps/api/src/chat/chat-session.repo.ts
  - apps/api/src/chat/chat-ownership.guard.ts
  - apps/api/src/chat/dto/create-chat.dto.ts
  - apps/api/src/chat/dto/list-chats.dto.ts
  - apps/api/src/chat/chat.controller.ts
  - apps/api/src/chat/chat.service.ts
  - apps/api/src/chat/chat.module.ts
  - apps/api/src/chat/__tests__/chat-session.repo.spec.ts
  - apps/api/src/chat/__tests__/chat-ownership.guard.spec.ts
  - apps/api/src/chat/__tests__/chat.controller.history.e2e-spec.ts
  - apps/web/package.json
  - apps/web/src/app/(app)/chat/page.tsx
  - apps/web/src/app/(app)/chat/[id]/page.tsx
  - apps/web/src/app/(app)/chat/new/page.tsx
  - apps/web/src/app/(app)/chat/components/chat-thread.tsx
  - apps/web/src/app/(app)/chat/components/chat-input.tsx
  - apps/web/src/app/(app)/chat/components/message-bubble.tsx
  - apps/web/src/app/(app)/chat/components/citation-pill.tsx
  - apps/web/src/app/(app)/chat/components/tool-breadcrumb.tsx
  - apps/web/src/app/(app)/chat/components/refusal-banner.tsx
  - apps/web/src/app/(app)/chat/components/scope-picker.tsx
  - apps/web/src/app/(app)/chat/components/__tests__/chat-thread.test.tsx
  - apps/web/src/app/(app)/chat/components/__tests__/citation-pill.test.tsx
  - apps/web/src/lib/chat-api.ts

must_haves:
  truths:
    - "Every numeric token in the streamed answer is cross-checked against this turn's tool-result citations; uncited numbers emit a CITATION_MISSING event surfaced as a [verify] marker in the UI."
    - "Chat sessions are persisted in MongoDB scoped by userId; messages array embeds role/content/citations/toolCalls/refusalCategory/messageId/createdAt."
    - "GET /chats lists the current user's sessions (paginated, no messages projected for list view); GET /chats/:id returns the full session ONLY if ctx.user.id === session.userId — otherwise 403."
    - "User can open the chat UI at /chat, see past conversations, click into one to read the full thread, and start a new chat with a scope picker (stock/fund/portfolio/compare)."
    - "ChatThread component consumes the SSE stream via @microsoft/fetch-event-source with HttpOnly cookie credentials and renders token shimmer, tool breadcrumbs, citation pills, and refusal banners."
    - "AIService.chatStream now loads the last 10 turns from the persisted ChatSession as history; UI still shows the full thread."
    - "Idempotent reconnect: re-POSTing with the same messageId returns the persisted assistant reply as a single replay event (no duplicate Gemini call)."
  artifacts:
    - path: "apps/api/src/ai/sanitiser/citation-validator.ts"
      provides: "validateCitations(answer, toolResults) → { ok, missing[] } with Indian numeric regex"
      exports: ["validateCitations", "NUMERIC_TOKEN"]
    - path: "apps/api/src/chat/chat-session.schema.ts"
      provides: "Mongoose ChatSession schema + ChatMessage subdoc + soft-delete + (userId,updatedAt) index"
      exports: ["ChatSession", "ChatSessionSchema", "ChatMessage"]
      contains: "deletedAt"
    - path: "apps/api/src/chat/chat-session.repo.ts"
      provides: "Per-user CRUD: create/listByUser/getById/appendUser/appendAssistant/appendRefusal/loadHistory/findMessage/getScope"
      exports: ["ChatSessionRepo"]
    - path: "apps/api/src/chat/chat-ownership.guard.ts"
      provides: "Asserts session.userId === req.user.id on every :id route"
      exports: ["ChatOwnershipGuard"]
    - path: "apps/web/src/app/(app)/chat/components/chat-thread.tsx"
      provides: "EventSource client component rendering streamed tokens + tool breadcrumbs + citations + refusals"
      min_lines: 80
    - path: "apps/web/src/app/(app)/chat/page.tsx"
      provides: "Past-conversations list (server-rendered, paginated)"
      min_lines: 30
  key_links:
    - from: "apps/api/src/chat/chat.controller.ts"
      to: "apps/api/src/chat/chat-ownership.guard.ts"
      via: "@UseGuards(JwtAuthGuard, ChatOwnershipGuard) on every :id route"
      pattern: "ChatOwnershipGuard"
    - from: "apps/api/src/chat/chat.service.ts"
      to: "apps/api/src/chat/chat-session.repo.ts"
      via: "sessions.loadHistory + appendUser + appendAssistant + findMessage (idempotent reconnect)"
      pattern: "sessions\\.(loadHistory|appendUser|appendAssistant|findMessage)"
    - from: "apps/api/src/chat/chat.service.ts"
      to: "apps/api/src/ai/sanitiser/citation-validator.ts"
      via: "validateCitations in onComplete callback; emits CITATION_MISSING event if missing"
      pattern: "validateCitations"
    - from: "apps/web/src/app/(app)/chat/components/chat-thread.tsx"
      to: "apps/api/src/chat/chat.controller.ts (POST /chats/:id/messages SSE)"
      via: "@microsoft/fetch-event-source with credentials:'include' + nanoid messageId"
      pattern: "fetchEventSource"
    - from: "apps/web/src/app/(app)/chat/page.tsx"
      to: "apps/api/src/chat/chat.controller.ts (GET /chats)"
      via: "Next.js server fetch with auth cookie forwarded"
      pattern: "GET\\s+/chats"
---

<objective>
Finalise CHAT-03 (citation validator + persisted citations) and deliver CHAT-05 (past conversations) end-to-end. Adds the `ChatSession` Mongo schema, REST history endpoints (`POST /chats`, `GET /chats`, `GET /chats/:id`), `ChatOwnershipGuard`, idempotent reconnect, and the full Next.js chat UI (thread + history list + scope picker + citation pills + tool breadcrumbs + refusal banners).

Purpose: Persistence + UI complete the Ask FinSight feature. After this plan a user can sign in, start a chat, see the assistant stream token-by-token with tool-call breadcrumbs and citation pills, return later, and read every past chat. Plan 04 (comparison) runs in parallel.

Output: Mongo schema + repo + ownership guard, REST endpoints, citation validator, extended ChatService with persistence + idempotency, full Next.js chat UI under `/chat`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/research/ARCHITECTURE.md
@.planning/research/PITFALLS.md
@.planning/phases/07-ask-finsight-chat-comparison/07-RESEARCH.md
@.planning/phases/07-ask-finsight-chat-comparison/07-01-SUMMARY.md
@.planning/phases/07-ask-finsight-chat-comparison/07-02-SUMMARY.md
@apps/api/src/chat/chat.controller.ts
@apps/api/src/chat/chat.service.ts
@apps/api/src/chat/chat.module.ts
@apps/api/src/ai/ai.service.ts
@apps/api/src/ai/refusal/refusal.enum.ts
@apps/api/src/ai/refusal/refusal-templates.ts

<interfaces>
Plan 02 produced (consumed here):
```typescript
// apps/api/src/ai/refusal/refusal.enum.ts — already imported
export enum RefusalCategory { ... }

// apps/api/src/ai/ai.service.ts
export interface ChatStreamOpts {
  history: Content[];   // <-- Plan 03 actually populates this from ChatSession
  userMessage: string;
  scope: { type, symbols };
  abortSignal: AbortSignal;
  onSafeChunk, onToolStart, onToolEnd, onRefusal, onComplete: ...;
}
// AIService.chatStream(opts: ChatStreamOpts): Promise<void>

// apps/api/src/chat/chat.controller.ts — Plan 03 EXTENDS with REST routes
@Controller('chats')
export class ChatController {
  @Sse(':id/messages') stream(...) { ... }     // Plan 02 — KEEP, do not remove
  // NEW in Plan 03:
  // @Post() create(...)
  // @Get() list(...)
  // @Get(':id') get(...)
}

// apps/api/src/chat/chat.service.ts — Plan 03 EXTENDS with persistence + idempotency
// streamReply now: loads history, persists user msg, runs aiService.chatStream,
//                  on onComplete validates citations + persists assistant msg
```

Plan 03 PRODUCES:
```typescript
// apps/api/src/chat/chat-session.schema.ts
@Schema({ timestamps: true })
export class ChatSession {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) userId: Types.ObjectId;
  @Prop({ required: true, maxlength: 120 }) title: string;
  @Prop({ type: { type: { type: String, enum: ['stock','fund','portfolio','compare'] }, symbols: [String] } })
  scope: { type: 'stock'|'fund'|'portfolio'|'compare'; symbols: string[] };
  @Prop({ type: [ChatMessageSubSchema], default: [] }) messages: ChatMessage[];
  @Prop({ type: Date, default: null }) deletedAt: Date | null;
  createdAt: Date; updatedAt: Date;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  citations: { sourceTag: string; asOfDate: Date }[];
  toolCalls: { name: string; args: unknown; sourceTag: string }[];
  refusalCategory?: RefusalCategory;
  messageId: string;
  createdAt: Date;
}

// apps/api/src/chat/chat-session.repo.ts
export class ChatSessionRepo {
  create(opts: { userId, scope, title }): Promise<ChatSession>;
  listByUser(userId: string, cursor: string | undefined, limit: number): Promise<{ items, nextCursor }>;
  getById(sessionId: string, userId: string): Promise<ChatSession | null>;             // ALWAYS filters by userId
  exists(filter: { _id, userId, deletedAt: null }): Promise<boolean>;
  loadHistory(sessionId: string, lastN: number): Promise<Content[]>;                    // Gemini Content[] shape
  findMessage(sessionId: string, messageId: string): Promise<ChatMessage | null>;
  appendUser(sessionId, messageId, content): Promise<void>;
  appendAssistant(sessionId, messageId, content, citations, refusalCategory?): Promise<void>;
  appendRefusal(sessionId, messageId, category): Promise<void>;
  getScope(sessionId: string): Promise<{ type, symbols }>;
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Citation validator + ChatSession schema + ChatSessionRepo + ChatOwnershipGuard</name>
  <files>
    apps/api/src/ai/sanitiser/citation-validator.ts
    apps/api/src/ai/sanitiser/__tests__/citation-validator.spec.ts
    apps/api/src/chat/chat-session.schema.ts
    apps/api/src/chat/chat-session.repo.ts
    apps/api/src/chat/chat-ownership.guard.ts
    apps/api/src/chat/__tests__/chat-session.repo.spec.ts
    apps/api/src/chat/__tests__/chat-ownership.guard.spec.ts
  </files>
  <behavior>
    **Citation validator (pure logic — primary TDD candidate):**
    - `validateCitations("The score is 7.2.", [{ data: { score: 7.2 }, sourceTag: 's1', asOfDate: ... }])` → `{ ok: true, missing: [] }`.
    - `validateCitations("The score is 7.2.", [])` → `{ ok: false, missing: ['7.2'] }`.
    - `validateCitations("Market cap is ₹1,23,456 Cr.", [{ data: { marketCap: '₹1,23,456 Cr' }, ... }])` → ok. (₹ symbol is OPTIONAL in the haystack match — strip ₹ before comparing.)
    - `validateCitations("Revenue grew 18%.", [{ data: { growth: 18 }, ... }])` → ok (haystack stringification contains "18").
    - `validateCitations("AUM is 1.5 Cr and P/E is 7.2x and revenue is ₹1,23,456.", [{ data: { aum: '1.5 Cr', pe: 7.2, revenue: '₹1,23,456' }, ... }])` → ok.
    - `validateCitations("The score is 7.2 and growth is 99%.", [{ data: { score: 7.2 }, ... }])` → `{ ok: false, missing: ['99%'] }` (99% orphaned).
    - Indian formats: `₹1,23,456` (lakh format), `1.5 Cr`, `2.3 Lakh`, `7.2%`, bare integer `42`. Test all formats present in answer ARE detected as numeric tokens.
    - Edge: dates like `2026-05-28` should NOT match — restrict bare-integer pattern with negative-lookbehind for `-` OR require integer ≥ 100 to be "interesting" (skip 1-2 digit standalone integers like "1 of 3"). Decision: skip bare integers entirely; only match `₹`-prefixed, `Cr|Lakh|L|K|M|B|Tn`-suffixed, `%`-suffixed, and decimal numbers with `.` (e.g., `7.2`). The system prompt instructs Gemini to always include units, so bare integers are not authoritative anyway. Document in code comments.

    **ChatSessionRepo (Mongoose, mongodb-memory-server):**
    - `create({ userId, scope, title })` returns a session with the supplied fields, `messages: []`, `deletedAt: null`, auto-generated `_id`.
    - `listByUser(userId, cursor=undefined, limit=20)`:
       - Filters by `userId` + `deletedAt: null`.
       - Sorts `updatedAt: -1`.
       - Excludes the heavy `messages` field from projection.
       - With cursor (`updatedAt < cursor`), returns the next page.
       - Returns `{ items, nextCursor }` where `nextCursor` is the last item's `updatedAt.toISOString()` if `length > limit`, else `null`.
    - `getById(sessionId, userId)` — returns the session OR `null` if userId doesn't match (NEVER throws — guards do that). Test cross-user → null.
    - `loadHistory(sessionId, lastN=10)` — returns `Content[]` (Gemini shape: `[{ role: 'user'|'model', parts: [{text}] }, ...]`). Maps internal `role: 'assistant'` to Gemini `role: 'model'`. Skips `role: 'tool'` and `refusalCategory`-flagged messages. Returns last `lastN` non-refusal turns.
    - `findMessage(sessionId, messageId)` — searches embedded messages by `messageId`. Returns the message (assistant-side, if exists) or null.
    - `appendUser`, `appendAssistant`, `appendRefusal` — atomic `$push` to messages array, updates `updatedAt`.

    **ChatOwnershipGuard:**
    - `canActivate(ctx)` extracts `userId` from `req.user.id` and `sessionId` from `req.params.id`.
    - Calls `sessions.exists({ _id: sessionId, userId, deletedAt: null })`.
    - Returns true if exists, throws `ForbiddenException` otherwise.
    - Test: User A's token + User B's session → `ForbiddenException`. User A's token + own session → true. Missing user → `ForbiddenException`. Missing sessionId → `ForbiddenException`. Soft-deleted session → `ForbiddenException`.
  </behavior>
  <action>
    **citation-validator.ts** (per RESEARCH §Pattern E + Code Example, lines 369-387):
    ```ts
    export const NUMERIC_TOKEN = new RegExp(
      [
        '₹\\s?[\\d,]+(\\.\\d+)?',
        '\\d+(\\.\\d+)?\\s?(Cr|Lakh|L|K|M|B|Tn)\\b',
        '\\d+(\\.\\d+)?\\s?%',
        '\\d+\\.\\d+',   // decimals only — skip bare integers (see Behavior note)
      ].join('|'),
      'g',
    );

    export function validateCitations(
      answer: string,
      toolResults: { data: unknown; sourceTag: string; asOfDate: Date }[],
    ): { ok: boolean; missing: string[] } {
      const numbers = answer.match(NUMERIC_TOKEN) ?? [];
      const haystack = JSON.stringify(toolResults.map((r) => r.data));
      const norm = (s: string) => s.replace(/₹\s?/, '').replace(/\s+/g, '');
      const missing = numbers.filter((n) => !haystack.includes(norm(n)) && !haystack.includes(n));
      return { ok: missing.length === 0, missing };
    }
    ```

    **chat-session.schema.ts** (per RESEARCH §Pattern G + Code Example 5):
    - `@Schema({ _id: false })` subdocument `ChatMessage` (role enum, content, citations[], toolCalls[], refusalCategory?, messageId, createdAt).
    - `@Schema({ timestamps: true })` main `ChatSession` (userId required indexed, title required maxlength 120, scope { type enum, symbols [String] }, messages[ChatMessage], deletedAt nullable Date).
    - Indexes:
      - `ChatSessionSchema.index({ userId: 1, updatedAt: -1 })` — list view.
      - `ChatSessionSchema.index({ userId: 1, deletedAt: 1 })` — soft-delete filter.
      - `ChatSessionSchema.index({ 'messages.messageId': 1 })` — idempotent-reconnect lookup.
    - Mongoose `validate` on scope.symbols `1 <= length <= 3`.

    **chat-session.repo.ts** — Injectable NestJS provider wrapping `Model<ChatSession>`:
    - All `find*`/`update*` queries include `userId` parameter — TypeScript signature REQUIRES `userId: string` so accidentally omitting it is a compile error. Use a private helper `private withUser(filter, userId) { return { ...filter, userId: new Types.ObjectId(userId), deletedAt: null }; }`.
    - `loadHistory(sessionId, lastN=10)`:
      ```ts
      const session = await this.model.findById(sessionId, { messages: { $slice: -lastN * 2 } }).lean();
      if (!session) return [];
      return session.messages
        .filter((m) => !m.refusalCategory && m.role !== 'tool')
        .map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));
      ```
    - `appendAssistant(sessionId, messageId, content, citations, refusalCategory?)`:
      ```ts
      await this.model.updateOne(
        { _id: sessionId },
        { $push: { messages: { role: 'assistant', content, citations, refusalCategory, messageId, createdAt: new Date(), toolCalls: [] } } },
      );
      ```
    - Similar for `appendUser`, `appendRefusal`.

    **chat-ownership.guard.ts** — RESEARCH §Code Example 1 lines 640-652. Inject `ChatSessionRepo`.

    Tests (Jest + `mongodb-memory-server` already in use from Phase 1):
    - `citation-validator.spec.ts`: 10 cases per Behavior block above.
    - `chat-session.repo.spec.ts`: ~15 cases — create, list with cursor (assert pagination + projection), getById cross-user-null, loadHistory respects lastN, findMessage by id, all three append methods atomic, deletedAt filtering.
    - `chat-ownership.guard.spec.ts`: 5 cases per Behavior block.

    No `any`. No live Mongo. Per platform rules.
  </action>
  <verify>
    <automated>cd apps/api &amp;&amp; npx jest --testPathPattern="(citation-validator|chat-session\.repo|chat-ownership\.guard)" --bail --maxWorkers=2</automated>
  </verify>
  <done>
    All 3 spec files pass with ≥25 assertions total. Cross-user `getById` returns null (not throws). Cross-user `ChatOwnershipGuard` throws `ForbiddenException`. Citation validator catches orphaned `99%` and correctly handles `₹1,23,456`, `1.5 Cr`, `7.2%`. `npx tsc --noEmit` clean.
  </done>
</task>

<task type="auto">
  <name>Task 2: Extend ChatController + ChatService — REST endpoints, persistence, idempotent reconnect, citation event</name>
  <files>
    apps/api/src/chat/dto/create-chat.dto.ts
    apps/api/src/chat/dto/list-chats.dto.ts
    apps/api/src/chat/chat.controller.ts
    apps/api/src/chat/chat.service.ts
    apps/api/src/chat/chat.module.ts
    apps/api/src/chat/__tests__/chat.controller.history.e2e-spec.ts
  </files>
  <action>
    **DTOs:**
    - `create-chat.dto.ts`:
      ```ts
      export class CreateChatDto {
        @IsString() @Length(1, 120) title: string;
        @ValidateNested() @Type(() => ChatScopeDto) scope: ChatScopeDto;
      }
      export class ChatScopeDto {
        @IsEnum(['stock','fund','portfolio','compare']) type: 'stock'|'fund'|'portfolio'|'compare';
        @IsArray() @ArrayMinSize(1) @ArrayMaxSize(3) @IsString({ each: true }) @Matches(/^[A-Z0-9._-]+$/, { each: true })
        symbols: string[];
      }
      ```
    - `list-chats.dto.ts`:
      ```ts
      export class ListChatsDto {
        @IsOptional() @IsISO8601() cursor?: string;
        @IsOptional() @IsInt() @Min(1) @Max(50) @Type(() => Number) limit?: number;
      }
      ```

    **Extend chat.controller.ts** (KEEP Plan 02's `@Sse(':id/messages')` route untouched; ADD):
    ```ts
    @Post()
    create(@Body() dto: CreateChatDto, @CurrentUser() user: AuthenticatedUser) {
      return this.sessions.create({ userId: user.id, scope: dto.scope, title: dto.title });
    }

    @Get()
    list(@CurrentUser() user: AuthenticatedUser, @Query() q: ListChatsDto) {
      return this.sessions.listByUser(user.id, q.cursor, q.limit ?? 20);
    }

    @Get(':id')
    @UseGuards(ChatOwnershipGuard)
    get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
      return this.sessions.getById(id, user.id);
    }
    ```
    Update the existing `@Sse(':id/messages')` decorator chain to ALSO include `@UseGuards(ChatOwnershipGuard)`:
    ```ts
    @Sse(':id/messages')
    @UseGuards(ChatOwnershipGuard)
    @Throttle({ default: { limit: 30, ttl: 60_000 } })
    stream(...) { ... }
    ```

    **Extend chat.service.ts** — wire persistence + idempotency + citation validator into `streamReply`:
    1. At the very start of the async IIFE, BEFORE the refusal classifier:
       ```ts
       // idempotent reconnect
       const existing = await this.sessions.findMessage(opts.sessionId, opts.messageId);
       if (existing) {
         sub.next({ type: 'replay', data: JSON.stringify({ content: existing.content, citations: existing.citations, refusalCategory: existing.refusalCategory }) } as MessageEvent);
         sub.complete();
         return;
       }
       ```
    2. Look up scope: `const scope = await this.sessions.getScope(opts.sessionId);` (replaces Plan 02's hardcoded stub).
    3. After the pre-stream refusal classifier fires, persist the refusal:
       ```ts
       if (refusal) {
         await this.sessions.appendUser(opts.sessionId, opts.messageId, opts.content);
         await this.sessions.appendRefusal(opts.sessionId, opts.messageId + '-r', refusal);
         sub.next({ type: 'refusal', data: JSON.stringify({ category: refusal, message: REFUSAL_TEMPLATES[refusal] }) } as MessageEvent);
         sub.complete();
         return;
       }
       ```
    4. Persist the user message BEFORE calling AIService:
       ```ts
       await this.sessions.appendUser(opts.sessionId, opts.messageId, opts.content);
       const history = await this.sessions.loadHistory(opts.sessionId, 10);
       ```
    5. Track full assistant text and tool citations across the loop (the callbacks pass them; accumulate in scoped vars):
       ```ts
       let assembled = '';
       const collectedCitations: { sourceTag: string; asOfDate: Date }[] = [];
       ```
    6. In `onSafeChunk(t)` → `assembled += t; sub.next({ type: 'token', data: t });`
    7. In `onToolEnd(name, citation)` → `collectedCitations.push(citation);`
    8. In `onComplete(full, citations)`:
       ```ts
       const validation = validateCitations(assembled, /* synthesise from tool exec results — see note below */ collectedCitationsWithData);
       const refusalCat = validation.ok ? undefined : RefusalCategory.CITATION_MISSING;
       await this.sessions.appendAssistant(opts.sessionId, opts.messageId + '-r', assembled, collectedCitations, refusalCat);
       if (!validation.ok) {
         sub.next({ type: 'citation_missing', data: JSON.stringify({ missing: validation.missing }) } as MessageEvent);
       }
       sub.next({ type: 'done', data: JSON.stringify({ citations: collectedCitations }) } as MessageEvent);
       sub.complete();
       ```
       NOTE: `validateCitations` needs the actual tool RESULT data (not just sourceTag/asOfDate). Pipe it via a new optional callback shape: extend `onToolEnd` in `AIService.chatStream` to ALSO pass the `data` field (or thread a side-channel `lastToolResults` array). Simplest fix: have `AIService` invoke `onToolEnd(name, citation, data)` where `data` is the raw ToolResult.data — Task 2 here updates the ChatStreamOpts type signature in `ai.service.ts` to add `data: unknown` to the onToolEnd signature, and updates ai.service.ts callers accordingly. Plan 02's spec needs the same update — update both in this task.
    9. In `onRefusal(cat, meta)` → persist + emit:
       ```ts
       await this.sessions.appendRefusal(opts.sessionId, opts.messageId + '-r', cat);
       sub.next({ type: 'refusal', data: JSON.stringify({ category: cat, message: REFUSAL_TEMPLATES[cat], ...meta }) } as MessageEvent);
       sub.complete();
       ```

    **chat.module.ts** — register schema + repo + guard + new Mongoose model:
    ```ts
    MongooseModule.forFeature([{ name: ChatSession.name, schema: ChatSessionSchema }]),
    ```
    Switch ThrottlerModule to Redis storage if available from Phase 1's CacheModule (RESEARCH §Don't Hand-Roll); otherwise keep in-memory and document the upgrade.

    **chat.controller.history.e2e-spec.ts** — Nest e2e with mongodb-memory-server:
    - User A creates a session → 201 with `{ _id, scope, title, messages: [] }`.
    - User A lists → returns the session in `items`, `messages` omitted.
    - User A GET `/chats/:id` → returns full session.
    - User B token GET `/chats/:id` (A's session) → 403 (`ChatOwnershipGuard`).
    - User A POSTs message; reconnects with same `messageId` while the reply is persisted → receives a single `replay` event.
    - User A POSTs a message containing `"Should I buy AAPL?"` → first event is `refusal` with `category: OUT_OF_SCOPE_GEO`; session messages now contain the user msg + the refusal.
    - Citation-missing path: mock `AIService.chatStream` to emit `onSafeChunk("The score is 99%.")` then `onComplete("The score is 99%.", [])` → response contains `event: citation_missing` with `missing: ["99%"]`, then `event: done`. DB has assistant message with `refusalCategory: CITATION_MISSING`.
  </action>
  <verify>
    <automated>cd apps/api &amp;&amp; npx jest --testPathPattern="chat.controller.history" --bail --testTimeout=20000</automated>
  </verify>
  <done>
    All e2e assertions pass. `ChatOwnershipGuard` enforces cross-user isolation. Idempotent reconnect returns the persisted reply without a second Gemini call. Pre-stream refusals + citation-missing events are persisted with `refusalCategory` set. ChatStreamOpts `onToolEnd` signature updated to include raw `data` and Plan 02's spec still passes (`npx jest --testPathPattern="ai/__tests__"` green). `npx tsc --noEmit` clean.
  </done>
</task>

<task type="auto">
  <name>Task 3: Next.js chat UI — past conversations list, thread view, scope picker, citation/tool/refusal components</name>
  <files>
    apps/web/package.json
    apps/web/src/app/(app)/chat/page.tsx
    apps/web/src/app/(app)/chat/[id]/page.tsx
    apps/web/src/app/(app)/chat/new/page.tsx
    apps/web/src/app/(app)/chat/components/chat-thread.tsx
    apps/web/src/app/(app)/chat/components/chat-input.tsx
    apps/web/src/app/(app)/chat/components/message-bubble.tsx
    apps/web/src/app/(app)/chat/components/citation-pill.tsx
    apps/web/src/app/(app)/chat/components/tool-breadcrumb.tsx
    apps/web/src/app/(app)/chat/components/refusal-banner.tsx
    apps/web/src/app/(app)/chat/components/scope-picker.tsx
    apps/web/src/app/(app)/chat/components/__tests__/chat-thread.test.tsx
    apps/web/src/app/(app)/chat/components/__tests__/citation-pill.test.tsx
    apps/web/src/lib/chat-api.ts
  </files>
  <action>
    Install on web: `@microsoft/fetch-event-source@^2`, `nanoid@^5`. Run `pnpm dlx shadcn@latest add scroll-area textarea avatar badge skeleton tooltip` (RESEARCH §Standard Stack lines 105-109).

    **apps/web/src/lib/chat-api.ts** — typed wrappers:
    ```ts
    export interface ChatSession { _id: string; title: string; scope: { type, symbols }; updatedAt: string; messages?: ChatMessage[]; }
    export interface ChatMessage { role: 'user'|'assistant'|'tool'; content: string; citations: {...}[]; messageId: string; refusalCategory?: string; createdAt: string; }

    export async function listChats(cursor?: string): Promise<{ items: ChatSession[]; nextCursor: string | null }>;
    export async function getChat(id: string): Promise<ChatSession>;
    export async function createChat(input: { title: string; scope: {...} }): Promise<ChatSession>;
    ```
    All call the Next.js API proxy that forwards to NestJS with HttpOnly cookie auth — use whatever proxy convention the project already established in Phase 1 (`fetch('/api/chats', { credentials: 'include' })`). If the proxy isn't set up yet, point directly at `NEXT_PUBLIC_API_BASE_URL` (server-side calls only — keep keys out of the client).

    **/chat/page.tsx (RSC, server-rendered):**
    - Server component. Calls `listChats()` server-side (uses incoming request cookie). Renders:
      - Page heading "Your conversations".
      - Empty state (Card) with "Start your first chat" CTA → `/chat/new`.
      - List of sessions: each row a `Card` with title, scope badges (e.g. `Stock · RELIANCE.NS`), `updatedAt` formatted as relative time, click → `/chat/{id}`.
      - "Load more" link with `?cursor=...` query.
    - Loading.tsx adjacent file with shadcn `<Skeleton>` rows.

    **/chat/[id]/page.tsx (RSC + client island):**
    - Server-fetch the session (`getChat(id)`). On 403/404 → `notFound()`.
    - Render the past message history (server-rendered, SEO-irrelevant but fast first paint).
    - At the bottom, mount `<ChatThread sessionId={id} initialMessages={session.messages ?? []} />` as a client component for live streaming of the NEXT message.

    **/chat/new/page.tsx (RSC + client island):**
    - Server-rendered scope picker:
      - Radio: Stock / Fund / Portfolio / Compare.
      - Symbol multi-select (uses the Phase 5 search/autocomplete component) with min 1, max 3.
      - Title field (optional; auto-derived from first message if blank).
      - "Start chat" button → calls `createChat()` (client) → navigate to `/chat/{id}`.

    **components/chat-thread.tsx** ('use client' — RESEARCH §Code Example 7):
    - `useState<UiMessage[]>` for the rendered thread.
    - `useRef<AbortController>` for the active stream.
    - `send(content)`:
      1. `messageId = nanoid()`.
      2. Append user bubble + placeholder assistant bubble with `streaming: true`.
      3. `fetchEventSource(\`/api/chats/${sessionId}/messages?content=${encodeURIComponent(content)}&messageId=${messageId}\`, { credentials: 'include', signal: abort.signal, openWhenHidden: true, onmessage(ev) { ... }, onerror(err) { setStreaming(false); throw err; } })`.
      4. Event switch:
         - `token` → append `ev.data` to the streaming assistant bubble's content.
         - `tool_start` → render a `<ToolBreadcrumb>` row above the assistant bubble (`Looking up ${ev.data}…`).
         - `tool_end` → update breadcrumb to "Looked up ${name} ✓" with a citation pill linking to `sourceTag`.
         - `citation_missing` → mark each `missing` number in the assistant bubble with a yellow `[verify]` badge.
         - `refusal` → replace assistant bubble content with `<RefusalBanner>` styled per `category`; clear `streaming` flag.
         - `replay` → set bubble content from the persisted reply; clear streaming.
         - `done` → set `citations` on the bubble; clear streaming.
         - `error` → toast "Stream failed. Try again." (use `sonner` if installed, else shadcn `Toast`).
    - `useEffect` cleanup aborts in-flight on unmount.
    - JSX:
      ```tsx
      <div className="flex flex-col h-full">
        <ScrollArea className="flex-1 p-4 space-y-3">
          {messages.map((m) => m.role === 'user'
            ? <MessageBubble variant="user" message={m} />
            : m.refusalCategory
              ? <RefusalBanner category={m.refusalCategory} message={m.content} />
              : <MessageBubble variant="assistant" message={m} streaming={m.streaming} />)}
        </ScrollArea>
        <ChatInput onSend={send} disabled={streaming} />
      </div>
      ```

    **components/chat-input.tsx** — shadcn `Textarea` + `Button`. Enter sends; Shift+Enter newline. Max 2000 chars (mirror server). Character counter in muted text.

    **components/message-bubble.tsx**:
    - User: right-aligned, neutral grey card.
    - Assistant: left-aligned, white card with the FinSight avatar.
    - Body: Markdown-rendered (use `react-markdown` if already installed in Phase 4 reports; if not, plain `<p>` with `whitespace-pre-wrap`).
    - When `streaming: true`: append a blinking caret span at end of content.
    - When `citations.length > 0`: render row of `<CitationPill>` below the content.
    - Disclaimer line at the bottom of assistant bubble: `Analysis only — not investment advice. Past performance does not guarantee future returns.` (Per COMP-03; compact muted typography.)

    **components/citation-pill.tsx**:
    - Renders a small `<Badge variant="outline">` showing the source domain (e.g., `FinSight Score · 28 May`).
    - Tooltip on hover: full `sourceTag` + `asOfDate`.
    - Click opens a modal with the source breakdown (for v1, just show the raw sourceTag and asOfDate — Plan 04+ can link to the report page).

    **components/tool-breadcrumb.tsx**:
    - Renders a thin row "Looking up *getInstrumentScore* for RELIANCE.NS…" → on `tool_end` updates to "Looked up *getInstrumentScore* ✓".

    **components/refusal-banner.tsx**:
    - Card with a yellow/amber accent, `<Badge>` showing the human-readable category name, and the canonical refusal text from `REFUSAL_TEMPLATES`.
    - For `OUT_OF_SCOPE_GEO` → muted "FinSight covers Indian markets only" framing.

    **components/scope-picker.tsx** — used by `/chat/new/page.tsx`. RadioGroup + symbol multi-select. Reuses the existing Phase 5 search autocomplete component.

    **Tests** (Vitest + React Testing Library — Phase 1 stack):
    - `chat-thread.test.tsx`: mock `fetchEventSource` with a controllable EventSource source. Cases: tokens stream into the bubble; tool_start renders breadcrumb; refusal swaps the bubble to RefusalBanner; abort on unmount.
    - `citation-pill.test.tsx`: renders sourceTag and asOfDate; tooltip on hover (assert via `userEvent.hover` if `@testing-library/user-event` is installed).

    UX polish (per CLAUDE.md "design-conscious" directive):
    - Empty state has a soft illustration placeholder (or icon) and inviting copy.
    - Tool breadcrumbs use a subtle dot-animation while in-flight.
    - Citation pills use a small `Info` icon and tabular-numeric for dates.
    - Refusal banners use Tailwind `bg-amber-50 dark:bg-amber-950/30 border-amber-200` — recognisable, not alarming.
    - Scope picker chips show the symbol + name + tiny price/NAV preview.
  </action>
  <verify>
    <automated>cd apps/web &amp;&amp; npx vitest run --reporter=basic chat-thread citation-pill</automated>
  </verify>
  <done>
    `/chat`, `/chat/[id]`, `/chat/new` routes render. Component tests pass. Manual smoke: log in, create chat, send "Tell me about RELIANCE.NS" → see tool breadcrumb → see streamed sentences → see citation pill → see disclaimer. Send "Should I buy AAPL?" → see amber refusal banner. Refresh page → past conversation visible in `/chat` list. `cd apps/web && npx next build` succeeds.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser ↔ NestJS REST + SSE | Cookie JWT auth; never trust `userId` from request body/query |
| Web RSC server → NestJS REST | Forward cookie via server-side fetch; ensure no `NEXT_PUBLIC_` leak |
| User A ↔ User B chat sessions | Mongo `_id` is guessable; ownership must be enforced server-side every request |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-15 | Information Disclosure (IDOR) | User B GETs User A's chat via session ID | mitigate | `ChatOwnershipGuard` (Task 1) on every `:id` route; `ChatSessionRepo.getById` always filters by `userId`; e2e test asserts 403 (Task 2) |
| T-07-16 | Tampering | Reconnect duplicates a user message → double-billed Gemini | mitigate | Idempotent reconnect: `findMessage(messageId)` returns persisted reply as `replay` event without Gemini call (Task 2) |
| T-07-17 | Information Disclosure | Chat content (DPDP "personal data") logged in structured logs | mitigate | Logger NEVER logs `opts.content`; only `sessionId` + error code (Plan 02 enforced; Plan 03 preserves) |
| T-07-18 | Tampering | Gemini emits an uncited number → user trusts a hallucination | mitigate | `validateCitations` runs in `onComplete` (Task 1+2); orphans trigger `citation_missing` event + `refusalCategory: CITATION_MISSING` persisted |
| T-07-19 | Repudiation | No record of what Gemini said for compliance audit | mitigate | Every assistant message persisted with citations array and refusalCategory; sampled human audit possible (out-of-scope for code, in-scope for ops) |
| T-07-20 | Spoofing | XSS via assistant content injected from Gemini | mitigate | `react-markdown` with safe defaults OR plain text rendering with `whitespace-pre-wrap`; no `dangerouslySetInnerHTML` (Task 3) |
| T-07-21 | Tampering | Stale citation: Turn 1 cited `7.2` (hashA), recompute → hashB → Turn 4 still says `7.2` | accept (v1) | RESEARCH §Pitfall 4 — UI shows `asOfDate` on every citation pill; system prompt instructs Gemini to re-fetch via tools each turn. Add hard cache-bust in a later milestone if drift is observed. |
| T-07-22 | Information Disclosure | Soft-deleted sessions still readable via direct GET | mitigate | All `getById`/`listByUser`/`ChatOwnershipGuard` queries filter `deletedAt: null` (Task 1 test asserts) |
</threat_model>

<verification>
- `cd apps/api && npx jest --testPathPattern="(citation-validator|chat-session|chat-ownership|chat.controller.history)" --bail` — all spec files green.
- `cd apps/api && npx jest --testPathPattern="ai/__tests__"` — Plan 02 specs still green after `onToolEnd` signature update.
- `cd apps/api && npx tsc --noEmit -p tsconfig.build.json` clean.
- `cd apps/web && npx vitest run` — chat component tests green.
- `cd apps/web && npx next build` succeeds.
- Manual smoke (with `pnpm dev` + real Gemini key): full flow from /chat/new → streaming reply → citation pill → past conversation list → cross-user 403 verified by signing in as second user.
</verification>

<success_criteria>
- CHAT-05 fully delivered: REST CRUD + ownership guard + chat UI past-conversation list.
- CHAT-03 finalised: streaming sanitiser (Plan 02) + citation validator (Plan 03) together cover both halves — orphaned numbers surfaced as `citation_missing` events + `[verify]` markers, every assistant message persisted with citations.
- Idempotent reconnect prevents double-billing.
- Cross-user chat read is impossible (ChatOwnershipGuard + repo-level filter; e2e proves 403).
- UI quality: clean shadcn layout, citation pills with `asOfDate`, tool breadcrumbs, refusal banners; disclaimer on every assistant bubble.
</success_criteria>

<output>
After completion, create `.planning/phases/07-ask-finsight-chat-comparison/07-03-SUMMARY.md` covering:
- Final ChatSession schema + index list.
- Final `ChatStreamOpts.onToolEnd` signature including raw tool data (delta vs Plan 02).
- Decision on hard-vs-soft delete (current: soft via `deletedAt`; purge job punted to Compliance Hardening milestone — see open questions).
- Citation validator behaviour notes for tokens it intentionally skips (bare integers, dates).
- Any UI patterns established for use in Plan 04 (compare UI).
</output>
