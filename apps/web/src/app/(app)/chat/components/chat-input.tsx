"use client";

import * as React from "react";
import { SendHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";

const MAX_LEN = 2000;

interface ChatInputProps {
  readonly onSend: (content: string) => void;
  readonly disabled?: boolean;
}

/** Textarea composer — Enter sends, Shift+Enter newlines, 2000-char cap. */
export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = React.useState("");

  const submit = (): void => {
    const trimmed = value.trim();
    if (trimmed.length === 0 || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <div className="border-t p-3">
      <div className="flex items-end gap-2">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, MAX_LEN))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          disabled={disabled}
          placeholder="Ask about an Indian stock or fund…"
          aria-label="Chat message"
          className="min-h-[44px] flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || value.trim().length === 0}
          aria-label="Send message"
          className={cn(
            "flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground",
            "disabled:opacity-40",
          )}
        >
          <SendHorizontal className="size-4" aria-hidden />
        </button>
      </div>
      <p className="mt-1 text-right text-[11px] text-muted-foreground tabular-nums">
        {value.length}/{MAX_LEN}
      </p>
    </div>
  );
}
