import Link from "next/link";
import { MessageSquarePlus, MessagesSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listChats, type ChatSessionSummary } from "@/lib/chat-api";

export const dynamic = "force-dynamic";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function ScopeBadges({ session }: { session: ChatSessionSummary }) {
  const label = session.scope.type[0]!.toUpperCase() + session.scope.type.slice(1);
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant="outline">{label}</Badge>
      {session.scope.symbols.map((s) => (
        <Badge key={s} variant="secondary">
          {s}
        </Badge>
      ))}
    </div>
  );
}

interface ChatListPageProps {
  readonly searchParams: Promise<{ cursor?: string }>;
}

export default async function ChatListPage({ searchParams }: ChatListPageProps) {
  const { cursor } = await searchParams;
  const { items, nextCursor } = await listChats(cursor);

  return (
    <div className="container mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Your conversations</h1>
        <Link
          href="/chat/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          <MessageSquarePlus className="size-4" aria-hidden />
          New chat
        </Link>
      </div>

      {items.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <MessagesSquare className="size-10 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            No conversations yet. Ask FinSight about any Indian stock or fund.
          </p>
          <Link
            href="/chat/new"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Start your first chat
          </Link>
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((s) => (
            <li key={s._id}>
              <Link href={`/chat/${s._id}`}>
                <Card className="flex flex-col gap-2 p-4 transition-colors hover:bg-muted/50">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-medium">{s.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {relativeTime(s.updatedAt)}
                    </span>
                  </div>
                  <ScopeBadges session={s} />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {nextCursor ? (
        <div className="text-center">
          <Link
            href={`/chat?cursor=${encodeURIComponent(nextCursor)}`}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Load more
          </Link>
        </div>
      ) : null}
    </div>
  );
}
