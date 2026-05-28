import { Skeleton } from "@/components/ui/skeleton";

export function ScoreVerdictShell() {
  return (
    <header className="flex items-center gap-6">
      <Skeleton className="h-44 w-44 rounded-full" />
      <div className="flex-1 space-y-3">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-6 w-24" />
      </div>
    </header>
  );
}

export function CardsShell() {
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-44 w-full" />
      ))}
    </section>
  );
}

export function ChartShell() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-[360px] w-full" />
    </div>
  );
}

export function PeersShell() {
  return (
    <section className="grid gap-6 lg:grid-cols-3">
      <Skeleton className="h-44 lg:col-span-2" />
      <Skeleton className="h-44" />
    </section>
  );
}

export function ReportPageSkeleton() {
  return (
    <article className="container mx-auto max-w-5xl space-y-8 px-4 py-8">
      <ScoreVerdictShell />
      <ChartShell />
      <CardsShell />
      <PeersShell />
    </article>
  );
}
