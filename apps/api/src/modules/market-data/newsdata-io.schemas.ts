import { z } from "zod";

export const newsdataResponseShape = z.object({
  status: z.literal("success"),
  results: z.array(
    z
      .object({
        article_id: z.string().min(1),
        title: z.string().min(1),
        link: z.string().url(),
        description: z.string().nullable().optional(),
        pubDate: z.string().min(1),
        source_id: z.string().min(1),
      })
      .passthrough(),
  ),
});

export type NewsdataResponse = z.infer<typeof newsdataResponseShape>;

/**
 * Strips the `apikey=…` query parameter from any URL before it is
 * structured-logged. Used by `NewsDataIoAdapter` to ensure the secret
 * never lands in log aggregation.
 */
export function redactApiKey(value: string): string {
  return value.replace(/(apikey=)[^&]+/gi, "$1[REDACTED]");
}
