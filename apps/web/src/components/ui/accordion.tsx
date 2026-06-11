"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Minimal accessible single-collapsible Accordion (dependency-free; no
 * `@radix-ui/react-accordion`, which is not installed in this project).
 *
 * Accessibility:
 *  - Each trigger is a native <button> → free Enter/Space activation and a
 *    real `button` role for behaviour-first RTL queries.
 *  - `aria-expanded` reflects open state; `aria-controls` + panel `id` wire
 *    the trigger to its region; the panel uses `role="region"`.
 *  - `type="single" collapsible`: opening one item closes the others; the
 *    open item can be toggled shut.
 *
 * This is the only interactive (client) primitive on the landing page; every
 * section component stays a Server Component.
 */
interface AccordionContextValue {
  readonly openValue: string | null;
  readonly toggle: (value: string) => void;
}

const AccordionContext = React.createContext<AccordionContextValue | null>(null);

function useAccordion(): AccordionContextValue {
  const ctx = React.useContext(AccordionContext);
  if (!ctx) {
    throw new Error("Accordion subcomponents must be used within <Accordion>.");
  }
  return ctx;
}

interface AccordionProps {
  readonly children: React.ReactNode;
  readonly className?: string;
  /** Reserved for API parity with shadcn; only "single" is implemented. */
  readonly type?: "single";
  readonly collapsible?: boolean;
}

function Accordion({ children, className }: AccordionProps) {
  const [openValue, setOpenValue] = React.useState<string | null>(null);
  const toggle = React.useCallback((value: string) => {
    setOpenValue((current) => (current === value ? null : value));
  }, []);
  const ctx = React.useMemo<AccordionContextValue>(
    () => ({ openValue, toggle }),
    [openValue, toggle],
  );
  return (
    <AccordionContext.Provider value={ctx}>
      <div className={cn("divide-y divide-border", className)}>{children}</div>
    </AccordionContext.Provider>
  );
}

interface AccordionItemContextValue {
  readonly value: string;
  readonly isOpen: boolean;
  readonly panelId: string;
  readonly triggerId: string;
}

const AccordionItemContext =
  React.createContext<AccordionItemContextValue | null>(null);

function useAccordionItem(): AccordionItemContextValue {
  const ctx = React.useContext(AccordionItemContext);
  if (!ctx) {
    throw new Error("AccordionItem subcomponents require <AccordionItem>.");
  }
  return ctx;
}

interface AccordionItemProps {
  readonly value: string;
  readonly children: React.ReactNode;
  readonly className?: string;
}

function AccordionItem({ value, children, className }: AccordionItemProps) {
  const { openValue } = useAccordion();
  const safe = value.replace(/[^a-zA-Z0-9_-]/g, "-");
  const itemCtx = React.useMemo<AccordionItemContextValue>(
    () => ({
      value,
      isOpen: openValue === value,
      panelId: `acc-panel-${safe}`,
      triggerId: `acc-trigger-${safe}`,
    }),
    [value, openValue, safe],
  );
  return (
    <AccordionItemContext.Provider value={itemCtx}>
      <div className={className}>{children}</div>
    </AccordionItemContext.Provider>
  );
}

interface AccordionTriggerProps {
  readonly children: React.ReactNode;
  readonly className?: string;
}

function AccordionTrigger({ children, className }: AccordionTriggerProps) {
  const { toggle } = useAccordion();
  const { value, isOpen, panelId, triggerId } = useAccordionItem();
  return (
    <h3 className="flex">
      <button
        type="button"
        id={triggerId}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => toggle(value)}
        className={cn(
          "flex flex-1 items-center justify-between gap-4 py-4 text-left text-base font-medium transition-colors hover:text-primary",
          className,
        )}
      >
        {children}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </button>
    </h3>
  );
}

interface AccordionContentProps {
  readonly children: React.ReactNode;
  readonly className?: string;
}

function AccordionContent({ children, className }: AccordionContentProps) {
  const { isOpen, panelId, triggerId } = useAccordionItem();
  if (!isOpen) {
    return null;
  }
  return (
    <div
      role="region"
      id={panelId}
      aria-labelledby={triggerId}
      className={cn("pb-4 text-sm text-muted-foreground", className)}
    >
      {children}
    </div>
  );
}

export {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
};
