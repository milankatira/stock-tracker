import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Minimal `Slot` primitive (a dependency-free stand-in for
 * `@radix-ui/react-slot`, which is not installed in this project).
 *
 * Clones its single child element and merges the Slot's own props onto it —
 * `className` is composed via `cn`, event handlers are chained, and other
 * props are shallow-merged (Slot props take precedence). This enables the
 * shadcn `asChild` pattern, e.g. `<Button asChild><Link href="/x" /></Button>`
 * renders a single `<a>` carrying the button's styling.
 */
type SlotProps = React.HTMLAttributes<HTMLElement> & {
  readonly children?: React.ReactNode;
};

function mergeProps(
  slotProps: Record<string, unknown>,
  childProps: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...childProps };

  for (const key of Object.keys(slotProps)) {
    const slotValue = slotProps[key];
    const childValue = childProps[key];

    if (/^on[A-Z]/.test(key)) {
      // Chain event handlers: child first, then slot.
      if (typeof slotValue === "function" && typeof childValue === "function") {
        merged[key] = (...args: unknown[]) => {
          (childValue as (...a: unknown[]) => void)(...args);
          (slotValue as (...a: unknown[]) => void)(...args);
        };
        continue;
      }
      merged[key] = slotValue ?? childValue;
      continue;
    }

    if (key === "className") {
      merged.className = cn(slotValue as string, childValue as string);
      continue;
    }

    if (key === "style") {
      merged.style = {
        ...(childValue as React.CSSProperties),
        ...(slotValue as React.CSSProperties),
      };
      continue;
    }

    merged[key] = slotValue;
  }

  return merged;
}

const Slot = React.forwardRef<HTMLElement, SlotProps>(
  ({ children, ...slotProps }, ref) => {
    if (!React.isValidElement(children)) {
      return null;
    }

    const child = children as React.ReactElement<Record<string, unknown>>;
    const merged = mergeProps(
      slotProps as Record<string, unknown>,
      child.props,
    );

    return React.cloneElement(child, { ...merged, ref });
  },
);
Slot.displayName = "Slot";

export { Slot };
