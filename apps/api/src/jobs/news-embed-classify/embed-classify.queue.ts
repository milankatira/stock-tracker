/**
 * Sibling queue for the per-article embed + classify pipeline (NEWS-02,
 * NEWS-03). Kept separate from `news-poll` so its tight Gemini rate
 * limit (60 RPM) does not throttle the cheap RSS fan-out.
 *
 * Lives under `src/jobs/**` (not `src/news/**`) because its processor
 * imports `AiService`, which the COMP-02 ESLint fence only permits from
 * `src/jobs/**` and `src/chat/**`.
 */
export const NEWS_EMBED_CLASSIFY_QUEUE_NAME = "news-embed-classify" as const;
export const NEWS_EMBED_CLASSIFY_JOB = "embed-classify" as const;

/** Bumping these invalidates per-article work → re-embed / re-classify. */
export const EMBEDDING_VERSION = "1" as const;
export const GEMINI_CLASSIFIER_VERSION = "1" as const;

export interface EmbedClassifyJobData {
  readonly newsId: string;
}

/** Domain event emitted after a successful classify, consumed by SentimentService. */
export const NEWS_CLASSIFIED_EVENT = "news.classified" as const;

export interface NewsClassifiedEvent {
  readonly newsId: string;
  readonly instrumentMentions: readonly string[];
}
