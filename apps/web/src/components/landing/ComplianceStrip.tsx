// TODO(i18n): wire copy through t() when the i18n helper ships.

/**
 * Compliance strip — full-width trust block reinforcing the "analysis, not
 * advice" posture (SEBI compliance). Server Component.
 */
export function ComplianceStrip() {
  return (
    <section
      aria-label="Compliance notice"
      className="bg-muted"
    >
      <div className="mx-auto max-w-4xl px-4 py-12 text-center sm:px-6 lg:px-8">
        <p className="text-balance text-lg font-semibold text-foreground sm:text-xl">
          Analysis, not advice. Data from NSE, BSE, AMFI. Past performance does
          not guarantee future results.
        </p>
      </div>
    </section>
  );
}
