// TODO(i18n): wire copy through t() when the i18n helper ships.
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { features } from "./data";

/** Features grid — responsive 1 → 2 → 3 columns. Server Component. */
export function Features() {
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8"
    >
      <h2
        id="features-heading"
        className="text-balance text-center text-3xl font-bold tracking-tight sm:text-4xl"
      >
        Everything you need to research, in one screen
      </h2>
      <p className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground">
        No data dumps. No advice. Just an opinionated, compliance-safe verdict
        you can act on.
      </p>
      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(({ icon: Icon, title, body }) => (
          <Card key={title} className="h-full">
            <CardHeader>
              <Icon className="h-8 w-8 text-brand-500" aria-hidden="true" />
              <CardTitle className="mt-4">{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>{body}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
