// TODO(i18n): wire copy through t() when the i18n helper ships.
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { personas } from "./data";

/** Personas — 4 avatar blocks. Responsive 1 → 2 → 4 columns. Server Component. */
export function Personas() {
  return (
    <section
      aria-labelledby="personas-heading"
      className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8"
    >
      <h2
        id="personas-heading"
        className="text-balance text-center text-3xl font-bold tracking-tight sm:text-4xl"
      >
        Built for every kind of Indian investor
      </h2>
      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {personas.map((p) => (
          <Card key={p.name} className="h-full">
            <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
              <Avatar>
                <AvatarFallback>{p.initials}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">
                  {p.name}, {p.age}
                </p>
                <p className="text-sm text-brand-700">{p.role}</p>
              </div>
              <p className="text-sm text-muted-foreground">{p.pain}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
