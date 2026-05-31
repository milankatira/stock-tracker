import { Loader2, Check } from "lucide-react";

interface ToolBreadcrumbProps {
  readonly name: string;
  readonly done?: boolean;
}

/** Thin status row shown while a read-only tool is fetching data (CHAT-01). */
export function ToolBreadcrumb({ name, done }: ToolBreadcrumbProps) {
  return (
    <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
      {done ? (
        <Check className="size-3 text-emerald-600" aria-hidden />
      ) : (
        <Loader2 className="size-3 animate-spin" aria-hidden />
      )}
      <span>
        {done ? "Looked up" : "Looking up"} <span className="font-medium">{name}</span>
        {done ? " ✓" : "…"}
      </span>
    </div>
  );
}
