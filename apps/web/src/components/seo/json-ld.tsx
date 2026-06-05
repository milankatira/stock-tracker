/**
 * Inline JSON-LD <script> emitter for the public SEO pages (SEO-03a).
 *
 * Renders one `<script type="application/ld+json">` per structured-data block
 * so crawlers see Corporation/FinancialProduct + Article + BreadcrumbList in
 * view-source HTML. Pure Server Component — no `'use client'`.
 *
 * Why `dangerouslySetInnerHTML`: JSON-LD must be emitted as raw text inside a
 * script tag, not as escaped React children. The content is server-built from
 * typed schema-dts objects (never user-controlled free text beyond the
 * already-compliance-sanitised narrative), so there is no injection surface.
 */
import type { ReactElement } from "react";

interface JsonLdProps {
  readonly data: object;
}

export function JsonLd({ data }: JsonLdProps): ReactElement {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
