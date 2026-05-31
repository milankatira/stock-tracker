import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChatThread } from "../chat-thread";

const { sse } = vi.hoisted(() => ({
  sse: { events: [] as { event: string; data: string }[] },
}));

vi.mock("@microsoft/fetch-event-source", () => ({
  fetchEventSource: async (
    _url: string,
    opts: { onmessage: (e: { event: string; data: string; id: string }) => void },
  ): Promise<void> => {
    for (const e of sse.events) opts.onmessage({ event: e.event, data: e.data, id: "" });
  },
}));

vi.mock("nanoid", () => ({ nanoid: () => "testid" }));

async function sendMessage(text: string): Promise<void> {
  const input = screen.getByLabelText("Chat message");
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: "Enter" });
}

describe("ChatThread", () => {
  beforeEach(() => {
    sse.events = [];
  });

  it("streams tokens into the assistant bubble and renders a tool breadcrumb", async () => {
    sse.events = [
      { event: "tool_start", data: "getInstrumentScore" },
      { event: "tool_end", data: JSON.stringify({ name: "getInstrumentScore", sourceTag: "score:stock:RELIANCE", asOfDate: "2026-05-28" }) },
      { event: "token", data: "Reliance has a Strong Score." },
      { event: "done", data: JSON.stringify({ citations: [{ sourceTag: "score:stock:RELIANCE", asOfDate: "2026-05-28" }] }) },
    ];
    render(<ChatThread sessionId="s1" initialMessages={[]} />);
    await sendMessage("Tell me about RELIANCE");

    await waitFor(() => {
      expect(screen.getByText("Reliance has a Strong Score.")).toBeInTheDocument();
    });
    expect(screen.getByText(/Looked up/)).toBeInTheDocument();
    expect(screen.getByText(/FinSight Score · RELIANCE/)).toBeInTheDocument();
  });

  it("renders past messages from initialMessages", () => {
    render(
      <ChatThread
        sessionId="s1"
        initialMessages={[
          { role: "user", content: "hi", citations: [], messageId: "m0", createdAt: "" },
          { role: "assistant", content: "A Strong Score.", citations: [], messageId: "m0", createdAt: "" },
        ]}
      />,
    );
    expect(screen.getByText("hi")).toBeInTheDocument();
    expect(screen.getByText("A Strong Score.")).toBeInTheDocument();
  });

  it("swaps the bubble for a refusal banner on a refusal event", async () => {
    sse.events = [
      { event: "refusal", data: JSON.stringify({ category: "OUT_OF_SCOPE_GEO", message: "FinSight covers Indian markets only." }) },
    ];
    render(<ChatThread sessionId="s1" initialMessages={[]} />);
    await sendMessage("Should I buy AAPL?");

    await waitFor(() => {
      expect(screen.getByText("FinSight covers Indian markets only.")).toBeInTheDocument();
    });
    expect(screen.getByText("Indian markets only")).toBeInTheDocument();
  });
});
