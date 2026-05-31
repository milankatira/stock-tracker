import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ScopePicker } from "../components/scope-picker";

export default function NewChatPage() {
  return (
    <div className="container mx-auto max-w-xl space-y-6 px-4 py-8">
      <Link
        href="/chat"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Conversations
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Start a new chat</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick what you want to analyse — FinSight answers with data-backed analysis, not advice.
        </p>
      </div>
      <ScopePicker />
    </div>
  );
}
