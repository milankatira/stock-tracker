/**
 * Inline JSON-LD <script> emitter for the public SEO pages (SEO-03a).
 *
 * Renders one `<script type="application/ld+json">` per structured-data block
 * so crawlers see Corporation/FinancialProduct + Article + BreadcrumbList in
 * view-source HTML. Pure Server Component — no `'use client'`.
 *
 * Why `dangerouslySetInnerHTML`: JSON-LD must be emitted as raw text inside a
 * script tag, not as escaped React children. The content is server-built from
 * typed schema-dts objects. Fields originate from third-party feeds (Yahoo,
 * AMFI, MFAPI) and Gemini narrative — untrusted — so we escape every `<` to
 * its unicode escape, which prevents a literal closing `script` tag in any
 * string value from terminating the script block early and rendering the
 * following bytes as live HTML (WR-01 stored-XSS hardening).
 */
import type { ReactElement } from "react";

interface JsonLdProps {
  readonly data: object;
}

export function JsonLd({ data }: JsonLdProps): ReactElement {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
