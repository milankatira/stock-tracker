import { notFound } from "next/navigation";
import { getChat } from "@/lib/chat-api";
import { ChatThread } from "../components/chat-thread";

export const dynamic = "force-dynamic";

interface ChatDetailPageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function ChatDetailPage({ params }: ChatDetailPageProps) {
  const { id } = await params;
  const session = await getChat(id);
  if (!session) notFound();

  return (
    <div className="container mx-auto flex h-[calc(100vh-4rem)] max-w-2xl flex-col px-4 py-4">
      <header className="pb-2">
        <h1 className="truncate text-lg font-semibold">{session.title}</h1>
        <p className="text-xs text-muted-foreground">
          {session.scope.type} · {session.scope.symbols.join(", ")}
        </p>
      </header>
      <div className="min-h-0 flex-1 rounded-lg border">
        <ChatThread sessionId={session._id} initialMessages={session.messages} />
      </div>
    </div>
  );
}
