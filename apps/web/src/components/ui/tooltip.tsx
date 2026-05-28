import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Minimal accessible tooltip wrapper.
 *
 * jsdom + radix-ui portals fight with React 19 Suspense in tests; we
 * deliberately ship a CSS-only hover/focus tooltip here. The wrapped
 * element exposes the definition via `aria-describedby` so the
 * accessibility tree (and behaviour-first RTL queries) can find the
 * text regardless of pointer hover state.
 */
interface TooltipProps {
  readonly content: string;
  readonly children: React.ReactNode;
  readonly className?: string;
}

let tooltipUid = 0;

function nextId(): string {
  tooltipUid += 1;
  return `tip-${tooltipUid}`;
}

export function Tooltip({ content, children, className }: TooltipProps) {
  const [id] = React.useState(nextId);
  return (
    <span className={cn("group relative inline-flex", className)}>
      <span aria-describedby={id} tabIndex={0} className="inline-flex">
        {children}
      </span>
      <span
        role="tooltip"
        id={id}
        className={cn(
          "pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 -translate-y-full",
          "whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1",
          "text-xs text-popover-foreground opacity-0 transition-opacity",
          "group-hover:opacity-100 group-focus-within:opacity-100",
        )}
      >
        {content}
      </span>
    </span>
  );
}
