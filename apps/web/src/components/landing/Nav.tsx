// TODO(i18n): wire copy through t() when the i18n helper ships.
import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Sticky top navigation. Server Component. */
export function Nav() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur">
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8"
      >
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-lg font-bold tracking-tight text-foreground"
        >
          FinSight AI
        </Link>
        <div className="flex items-center gap-2 sm:gap-4">
          <Button asChild variant="ghost" className="min-h-11">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild className="min-h-11">
            <Link href="/signup">Sign up</Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}
