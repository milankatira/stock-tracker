import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ChatCitation } from "@/lib/chat-api";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

/** Human label for a sourceTag like "score:stock:RELIANCE" → "Score · RELIANCE". */
function label(sourceTag: string): string {
  const [kind, , sym] = sourceTag.split(":");
  const kinds: Record<string, string> = {
    score: "FinSight Score",
    fundamentals: "Fundamentals",
    technicals: "Technicals",
    returns: "Returns",
    news: "News",
    peers: "Peers",
    search: "Search",
  };
  const name = kinds[kind ?? ""] ?? kind ?? "Source";
  return sym ? `${name} · ${sym}` : name;
}

/** A small lineage chip below an assistant answer (CHAT-03). */
export function CitationPill({ citation }: { citation: ChatCitation }) {
  const date = formatDate(citation.asOfDate);
  return (
    <Badge
      variant="outline"
      className="gap-1 font-normal tabular-nums"
      title={`${citation.sourceTag} · as of ${citation.asOfDate}`}
    >
      <Info className="size-3" aria-hidden />
      {label(citation.sourceTag)}
      {date ? ` · ${date}` : ""}
    </Badge>
  );
}
