import { Injectable, Logger, type MessageEvent } from "@nestjs/common";
import { Observable } from "rxjs";
import { AiService } from "../ai/ai.service";
import { RefusalDetector } from "../ai/refusal/refusal-detector";
import { REFUSAL_TEMPLATES } from "../ai/refusal/refusal-templates";
import type { RefusalCategory } from "../ai/refusal/refusal.enum";
import type { ChatScopeType, ToolContext } from "../ai/tools/tool.types";
import { ReportsService } from "../reports/reports.service";
import { FundReportsService } from "../reports/fund-reports.service";
import { NewsService } from "../news/news.service";
import { SearchService } from "../search/search.service";

const HEARTBEAT_MS = 15_000;

export interface StreamReplyOpts {
  readonly sessionId: string;
  readonly userId: string;
  readonly content: string;
  readonly messageId: string;
  readonly scope: { readonly type: ChatScopeType; readonly symbols: readonly string[] };
}

/**
 * Orchestrates a single Ask FinSight turn (CHAT-01/03/04): pre-stream
 * refusal gate → `AiService.chatStream` → SSE `MessageEvent`s. A 15s
 * heartbeat keeps proxies from killing long tool gaps, and client
 * disconnect (Observable teardown) aborts the in-flight Gemini request.
 *
 * Plan 02 does NOT persist messages — `history` is empty and `scope` is
 * supplied by the controller. Plan 03 adds ChatSession load/persist.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly refusalDetector: RefusalDetector,
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
        // 1. Pre-stream classifier — reject without spending a Gemini call.
        const refusal = this.refusalDetector.classify(opts.content);
        if (refusal) {
          emitRefusal(refusal);
          sub.complete();
          return;
        }

        // 2. Stream the answer.
        await this.aiService.chatStream({
          history: [],
          userMessage: opts.content,
          toolContext: this.buildToolContext(opts),
          abortSignal: abort.signal,
          onSafeChunk: (t) => sub.next({ type: "token", data: t }),
          onToolStart: (n) => sub.next({ type: "tool_start", data: n }),
          onToolEnd: (n, citation) =>
            sub.next({
              type: "tool_end",
              data: JSON.stringify({
                name: n,
                sourceTag: citation.sourceTag,
                asOfDate: citation.asOfDate.toISOString(),
              }),
            }),
          onRefusal: (cat, meta) => {
            emitRefusal(cat, meta);
            sub.complete();
          },
          onComplete: (_full, citations) => {
            sub.next({
              type: "done",
              data: JSON.stringify({
                citations: citations.map((c) => ({
                  sourceTag: c.sourceTag,
                  asOfDate: c.asOfDate.toISOString(),
                })),
              }),
            });
            sub.complete();
          },
        });
      })().catch((err: unknown) => {
        // Never log opts.content (PII per DPDP) — only the session + error code.
        this.logger.error(
          { sessionId: opts.sessionId, message: err instanceof Error ? err.message : "unknown" },
          "chat_stream_failed",
        );
        sub.next({ type: "error", data: JSON.stringify({ message: "stream_failed" }) });
        sub.complete();
      });

      return () => {
        clearInterval(heartbeat);
        abort.abort();
      };
    });
  }

  private buildToolContext(opts: StreamReplyOpts): ToolContext {
    // The real read-path services satisfy the narrow reader interfaces
    // structurally — no recomputation, materialised reads only.
    return {
      reports: this.reports,
      fundReports: this.fundReports,
      news: this.news,
      search: this.search,
      userId: opts.userId,
      scope: { type: opts.scope.type, symbols: opts.scope.symbols },
    };
  }
}
