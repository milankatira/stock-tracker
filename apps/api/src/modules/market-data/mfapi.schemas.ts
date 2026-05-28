import { z } from "zod";

/**
 * Boundary schemas for the MFAPI.in JSON responses.
 *
 * Date strings come back as "DD-MM-YYYY" — kept as a string here and
 * parsed to a real `Date` inside the adapter so the contract remains
 * narrow at the boundary.
 */

const mfapiMetaShape = z
  .object({
    scheme_code: z.coerce.string(),
    scheme_name: z.string().min(1),
    fund_house: z.string().optional(),
    scheme_type: z.string().optional(),
    scheme_category: z.string().optional(),
  })
  .passthrough();

const mfapiNavRowShape = z
  .object({
    date: z.string().regex(/^\d{2}-\d{2}-\d{4}$/),
    nav: z.coerce.number().finite().positive(),
  })
  .passthrough();

export const mfapiLatestShape = z
  .object({
    meta: mfapiMetaShape,
    data: z.array(mfapiNavRowShape).min(1),
    status: z.literal("SUCCESS"),
  })
  .passthrough();

export const mfapiHistoryShape = z
  .object({
    meta: mfapiMetaShape,
    data: z.array(mfapiNavRowShape),
    status: z.literal("SUCCESS"),
  })
  .passthrough();

export const mfapiSchemeListShape = z.array(
  z
    .object({
      schemeCode: z.coerce.string(),
      schemeName: z.string().min(1),
      isinGrowth: z.string().nullable().optional(),
      isinDivReinvestment: z.string().nullable().optional(),
    })
    .passthrough(),
);

export type MfapiLatest = z.infer<typeof mfapiLatestShape>;
export type MfapiHistory = z.infer<typeof mfapiHistoryShape>;
export type MfapiSchemeList = z.infer<typeof mfapiSchemeListShape>;
