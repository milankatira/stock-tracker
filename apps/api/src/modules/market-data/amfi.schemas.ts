import { z } from "zod";

/**
 * Row-level schema for AMFI's NAVAll.txt feed. We `safeParse` each row in
 * the parser (counting rejects) rather than `parse` the whole file as one
 * object — partial corruption inside the ~25k-row daily snapshot must
 * never drop the whole nightly load. The top-level integrity gate
 * (row count ≥ 8000) lives in the adapter.
 */
export const amfiNavRowShape = z.object({
  schemeCode: z.string().regex(/^\d+$/),
  isinGrowth: z.string().nullable(),
  isinReinvestment: z.string().nullable(),
  schemeName: z.string().min(1),
  nav: z.number().finite().positive(),
  date: z.string().regex(/^\d{1,2}-[A-Za-z]{3}-\d{4}$/),
});

export type AmfiNavRow = z.infer<typeof amfiNavRowShape>;
