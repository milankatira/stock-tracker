import * as React from "react";
import { cn } from "@/lib/cn";

const Skeleton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-testid="skeleton"
      className={cn("animate-pulse rounded-md bg-muted/50", className)}
      {...props}
    />
  ),
);
Skeleton.displayName = "Skeleton";

export { Skeleton };
