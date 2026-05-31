import { ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const CATEGORY_LABELS: Record<string, string> = {
  OUT_OF_SCOPE_GEO: "Indian markets only",
  OUT_OF_SCOPE_ASSET: "Out of scope",
  NON_COMPLIANT_INSIDER: "Not permitted",
  NON_COMPLIANT_GUARANTEE: "No guarantees",
  NON_COMPLIANT_BUYSELL: "Analysis, not advice",
  NON_COMPLIANT_TAX_EVASION: "Not permitted",
  PROMPT_INJECTION_DETECTED: "Can't help with that",
  TOOL_LIMIT_EXCEEDED: "Too complex",
  CITATION_MISSING: "Unverified",
  RATE_LIMITED: "Slow down",
};

interface RefusalBannerProps {
  readonly category: string;
  readonly message: string;
}

/**
 * Recognisable-but-not-alarming amber banner shown when the assistant
 * declines (CHAT-04). Renders the canonical refusal copy verbatim.
 */
export function RefusalBanner({ category, message }: RefusalBannerProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-950/30">
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
      <div className="space-y-1">
        <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-300">
          {CATEGORY_LABELS[category] ?? "Notice"}
        </Badge>
        <p className="text-sm text-amber-900 dark:text-amber-100">{message}</p>
      </div>
    </div>
  );
}
