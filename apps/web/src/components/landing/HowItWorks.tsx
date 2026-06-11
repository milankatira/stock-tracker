// TODO(i18n): wire copy through t() when the i18n helper ships.
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { howItWorksSteps } from "./data";

/** How it works — 3 numbered steps. Responsive 1 → 3 columns. Server Component. */
export function HowItWorks() {
  return (
    <section
      aria-labelledby="how-heading"
      className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8"
    >
      <h2
        id="how-heading"
        className="text-balance text-center text-3xl font-bold tracking-tight sm:text-4xl"
      >
        Search → Score → Decide for yourself
      </h2>
      <ol className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
        {howItWorksSteps.map((s) => (
          <li key={s.step}>
            <Card className="h-full">
              <CardHeader>
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-base font-bold text-primary-foreground"
                >
                  {s.step}
                </span>
                <CardTitle className="mt-4">{s.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{s.body}</p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
    </section>
  );
}
