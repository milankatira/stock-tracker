import { Injectable, Logger, type MessageEvent } from "@nestjs/common";
import { Observable } from "rxjs";
import { AiService, type ChatCitation } from "../ai/ai.service";
import { RefusalDetector } from "../ai/refusal/refusal-detector";
import { REFUSAL_TEMPLATES } from "../ai/refusal/refusal-templates";
import { RefusalCategory } from "../ai/refusal/refusal.enum";
import {
  validateCitations,
  type CitationCheckInput,
} from "../ai/sanitiser/citation-validator";
import type { ToolContext } from "../ai/tools/tool.types";
import { ReportsService } from "../reports/reports.service";
import { FundReportsService } from "../reports/fund-reports.service";
import { NewsService } from "../news/news.service";
import { SearchService } from "../search/search.service";
import { ChatSessionRepo } from "./chat-session.repo";

const HEARTBEAT_MS = 15_000;
const HISTORY_TURNS = 10;

export interface StreamReplyOpts {
  readonly sessionId: string;
  readonly userId: string;
  readonly content: string;
  readonly messageId: string;
}

/**
 * Orchestrates one Ask FinSight turn end-to-end (CHAT-01/03/04/05):
 * idempotent reconnect → pre-stream refusal gate → persist user msg →
 * `AiService.chatStream` → citation validation → persist assistant msg →
 * SSE `MessageEvent`s. Scope + history come from the persisted session.
 * A 15s heartbeat keeps proxies alive; client disconnect aborts Gemini.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly refusalDetector: RefusalDetector,
    private readonly sessions: ChatSessionRepo,
    private readonly reports: ReportsService,
    private readonly fundReports: FundReportsService,
    private readonly news: NewsService,
    private readonly search: SearchService,
  ) {}

  streamReply(opts: StreamReplyOpts): Observable<MessageEvent> {
    return new Observable<MessageEvent>((sub) => {
      const abort = new AbortController();
      const heartbeat = setInterval(() => {
        sub.next({ type: "comment", data: ":keepalive" });
      }, HEARTBEAT_MS);

      const emitRefusal = (cat: RefusalCategory, meta?: Record<string, unknown>): void => {
        sub.next({
          type: "refusal",
          data: JSON.stringify({ category: cat, message: REFUSAL_TEMPLATES[cat], ...meta }),
        });
      };

      void (async () => {
        // 1. Idempotent reconnect — replay the persisted reply, no Gemini call.
        const existing = await this.sessions.findMessage(opts.sessionId, opts.messageId);
        if (existing) {
          sub.next({
            type: "replay",
            data: JSON.stringify({
              content: existing.content,
              citations: existing.citations,
              refusalCategory: existing.refusalCategory,
            }),
          });
          sub.complete();
          return;
        }

        // 2. Pre-stream refusal gate — persist the turn + refusal, no Gemini call.
        const preRefusal = this.refusalDetector.classify(opts.content);
        if (preRefusal) {
          await this.sessions.appendUser(opts.sessionId, opts.messageId, opts.content);
          await this.sessions.appendRefusal(opts.sessionId, opts.messageId, preRefusal);
          emitRefusal(preRefusal);
          sub.complete();
          return;
        }

        // 3. Persist the user message + load history/scope from the session.
        await this.sessions.appendUser(opts.sessionId, opts.messageId, opts.content);
        const [history, scope] = await Promise.all([
          this.sessions.loadHistory(opts.sessionId, HISTORY_TURNS),
          this.sessions.getScope(opts.sessionId),
        ]);

        let assembled = "";
        const collected: ChatCitation[] = [];
        const toolData: CitationCheckInput[] = [];

        await this.aiService.chatStream({
          history,
          userMessage: opts.content,
          toolContext: this.buildToolContext(opts, scope),
          abortSignal: abort.signal,
          onSafeChunk: (t) => {
            assembled = assembled.length > 0 ? `${assembled} ${t}` : t;
            sub.next({ type: "token", data: t });
          },
          onToolStart: (n) => sub.next({ type: "tool_start", data: n }),
          onToolEnd: (n, citation, data) => {
            collected.push(citation);
            toolData.push({ data, sourceTag: citation.sourceTag, asOfDate: citation.asOfDate });
            sub.next({
              type: "tool_end",
              data: JSON.stringify({
                name: n,
                sourceTag: citation.sourceTag,
                asOfDate: citation.asOfDate.toISOString(),
              }),
            });
          },
          onRefusal: (cat, meta) => {
            void this.sessions
              .appendRefusal(opts.sessionId, opts.messageId, cat)
              .catch((e: unknown) => this.logFailure(opts.sessionId, e));
            emitRefusal(cat, meta);
            sub.complete();
          },
          onComplete: async (_full, finalCitations) => {
            const validation = validateCitations(assembled, toolData);
            const refusalCat = validation.ok ? undefined : RefusalCategory.CITATION_MISSING;
            await this.sessions.appendAssistant(
              opts.sessionId,
              opts.messageId,
              assembled,
              finalCitations,
              refusalCat,
            );
            if (!validation.ok) {
              sub.next({
                type: "citation_missing",
                data: JSON.stringify({ missing: validation.missing }),
              });
            }
            sub.next({
              type: "done",
              data: JSON.stringify({
                citations: finalCitations.map((c) => ({
                  sourceTag: c.sourceTag,
                  asOfDate: c.asOfDate.toISOString(),
                })),
              }),
            });
            sub.complete();
          },
        });
      })().catch((err: unknown) => {
        this.logFailure(opts.sessionId, err);
        sub.next({ type: "error", data: JSON.stringify({ message: "stream_failed" }) });
        sub.complete();
      });

      return () => {
        clearInterval(heartbeat);
        abort.abort();
      };
    });
  }

  private logFailure(sessionId: string, err: unknown): void {
    // Never log opts.content (PII per DPDP) — only the session + error message.
    this.logger.error(
      { sessionId, message: err instanceof Error ? err.message : "unknown" },
      "chat_stream_failed",
    );
  }

  private buildToolContext(
    opts: StreamReplyOpts,
    scope: ToolContext["scope"] | null,
  ): ToolContext {
    return {
      reports: this.reports,
      fundReports: this.fundReports,
      news: this.news,
      search: this.search,
      userId: opts.userId,
      scope: scope ?? { type: "stock", symbols: [] },
    };
  }
}
