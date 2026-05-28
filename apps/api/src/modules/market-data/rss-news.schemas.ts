import { z } from "zod";

/**
 * Validates the `rss-parser` output post-normalisation. Required fields:
 *  - `link`  — used as fallback dedup key when `<guid>` is missing
 *  - `title` — minimum payload for downstream sentiment / display
 * Everything else is optional; `rss-parser` does its own per-feed
 * tolerance for shape variants.
 */
export const rssItemShape = z
  .object({
    guid: z.string().optional(),
    link: z.string().url(),
    title: z.string().min(1),
    pubDate: z.string().optional(),
    isoDate: z.string().optional(),
    contentSnippet: z.string().optional(),
    content: z.string().optional(),
  })
  .passthrough();

export type RssParsedItem = z.infer<typeof rssItemShape>;
