import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Minimal Avatar primitive (dependency-free; no `@radix-ui/react-avatar`).
 * For the landing personas we render initials inside a circular fallback —
 * no remote image loading, so this is a pure Server Component.
 */
const Avatar = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      "relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full",
      className,
    )}
    {...props}
  />
));
Avatar.displayName = "Avatar";

const AvatarFallback = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center bg-muted text-sm font-semibold text-muted-foreground",
      className,
    )}
    {...props}
  />
));
AvatarFallback.displayName = "AvatarFallback";

export { Avatar, AvatarFallback };
