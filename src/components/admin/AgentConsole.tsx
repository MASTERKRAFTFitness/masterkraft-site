"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// The raw Anthropic conversation. Held here rather than on the server so the
// console needs no session store; the route re-validates every write against
// the tool_use block in this history before carrying it out.
type ApiMessage = { role: "user" | "assistant"; content: unknown };

type ToolChip = { id: string; name: string; summary: string; state: "running" | "done" | "error" | "declined" };
type Approval = { tool_use_id: string; name: string; summary: string; input: unknown };

type Entry =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; thinking: string; tools: ToolChip[] }
  | { kind: "error"; text: string };

const SUGGESTIONS = [
  "What came in over the last few days?",
  "Do we have stock of the C2 rower, and what does it sell for?",
  "Quote delivery of 2x MBCTMA01 to Parramatta 2150",
  "Draft a reply to the latest quote request",
];

export default function AgentConsole() {
  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // Issued by the server on the first turn and echoed back after, so a whole
  // thread lands under one audit record instead of fragmenting per message.
  const conversationId = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [entries, approvals, busy]);

  const run = useCallback(async (history: ApiMessage[], decisions: { tool_use_id: string; approved: boolean }[]) => {
    setBusy(true);
    setApprovals([]);
    // One assistant entry per run; text, thinking and tool chips all land in it.
    setEntries((prev) => [...prev, { kind: "assistant", text: "", thinking: "", tools: [] }]);

    const patch = (fn: (entry: Extract<Entry, { kind: "assistant" }>) => void) =>
      setEntries((prev) => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i--) {
          const entry = next[i];
          if (entry.kind === "assistant") {
            const copy = { ...entry, tools: [...entry.tools] };
            fn(copy);
            next[i] = copy;
            break;
          }
        }
        return next;
      });

    try {
      const res = await fetch("/api/admin/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, approvals: decisions, conversation_id: conversationId.current }),
      });

      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setEntries((prev) => [...prev, { kind: "error", text: data.error ?? `Request failed (${res.status}).` }]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE frames are blank-line separated; keep the tail for the next chunk.
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(line.slice(6));
          } catch {
            continue;
          }

          switch (event.type) {
            case "text":
              patch((e) => void (e.text += String(event.delta ?? "")));
              break;
            case "thinking":
              patch((e) => void (e.thinking += String(event.delta ?? "")));
              break;
            case "tool": {
              const chip: ToolChip = {
                id: `${event.name}-${event.summary}`,
                name: String(event.name),
                summary: String(event.summary ?? ""),
                state: (event.state as ToolChip["state"]) ?? "running",
              };
              patch((e) => {
                const existing = e.tools.findIndex((t) => t.id === chip.id);
                if (existing >= 0) e.tools[existing] = chip;
                else e.tools.push(chip);
              });
              break;
            }
            case "approval":
              setApprovals((prev) => [
                ...prev,
                {
                  tool_use_id: String(event.tool_use_id),
                  name: String(event.name),
                  summary: String(event.summary ?? ""),
                  input: event.input,
                },
              ]);
              break;
            case "messages":
              setMessages(event.messages as ApiMessage[]);
              if (typeof event.conversation_id === "string") conversationId.current = event.conversation_id;
              break;
            case "error":
              setEntries((prev) => [...prev, { kind: "error", text: String(event.message ?? "Error") }]);
              break;
          }
        }
      }
    } catch (e) {
      setEntries((prev) => [
        ...prev,
        { kind: "error", text: e instanceof Error ? e.message : "Connection lost." },
      ]);
    } finally {
      setBusy(false);
      // Drop the placeholder if the run produced nothing visible at all.
      setEntries((prev) => {
        const last = prev[prev.length - 1];
        return last?.kind === "assistant" && !last.text && !last.thinking && !last.tools.length
          ? prev.slice(0, -1)
          : prev;
      });
    }
  }, []);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const history: ApiMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(history);
    setEntries((prev) => [...prev, { kind: "user", text: trimmed }]);
    setInput("");
    void run(history, []);
  }

  function decide(approved: boolean) {
    const decisions = approvals.map((a) => ({ tool_use_id: a.tool_use_id, approved }));
    void run(messages, decisions);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-14rem)] border border-line bg-white">
      <div ref={scroller} className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
        {entries.length === 0 && (
          <div className="text-sm text-ash">
            <p className="mb-4">
              Ask about products, stock, orders or delivery. Anything that sends an email or writes to
              the CRM comes back here for your approval first.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="px-3 py-1.5 border border-line text-xs text-ink hover:border-accent transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {entries.map((entry, i) => {
          if (entry.kind === "user") {
            return (
              <div key={i} className="flex justify-end">
                <p className="max-w-[80%] bg-smoke px-4 py-2.5 text-sm text-ink whitespace-pre-wrap">{entry.text}</p>
              </div>
            );
          }
          if (entry.kind === "error") {
            return (
              <p key={i} role="alert" className="text-sm text-accent border-l-2 border-accent pl-3">
                {entry.text}
              </p>
            );
          }
          return (
            <div key={i} className="space-y-2">
              {entry.tools.map((tool) => (
                <div key={tool.id} className="flex items-center gap-2 text-xs font-mono text-ash">
                  <span
                    className={
                      tool.state === "error" || tool.state === "declined"
                        ? "text-accent"
                        : tool.state === "done"
                          ? "text-ink"
                          : "text-ash animate-pulse"
                    }
                  >
                    {tool.state === "done" ? "✓" : tool.state === "running" ? "···" : "✕"}
                  </span>
                  <span>{tool.summary}</span>
                </div>
              ))}
              {entry.thinking && !entry.text && (
                <p className="text-xs text-ash/70 italic whitespace-pre-wrap">{entry.thinking}</p>
              )}
              {entry.text && <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">{entry.text}</p>}
            </div>
          );
        })}

        {approvals.map((approval) => (
          <div key={approval.tool_use_id} className="border border-accent/40 bg-smoke p-4">
            <p className="text-xs uppercase tracking-wide text-ash font-display">Needs your approval</p>
            <p className="mt-1 text-sm text-ink font-medium">{approval.summary}</p>
            <pre className="mt-3 max-h-64 overflow-auto bg-white border border-line p-3 text-xs text-ink whitespace-pre-wrap font-mono">
              {JSON.stringify(approval.input, null, 2)}
            </pre>
          </div>
        ))}

        {approvals.length > 0 && !busy && (
          <div className="flex gap-2">
            <button onClick={() => decide(true)} className="btn btn-accent text-sm">
              Approve and send
            </button>
            <button onClick={() => decide(false)} className="btn btn-outline text-sm">
              Decline
            </button>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t border-line p-3 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={approvals.length ? "Approve or decline above first" : "Ask about a product, order or delivery"}
          disabled={busy || approvals.length > 0}
          aria-label="Message"
          className="flex-1 px-4 py-3 border border-line bg-white text-ink text-sm placeholder:text-ash/70 focus:outline-none focus:border-accent transition-colors disabled:bg-smoke"
        />
        <button type="submit" disabled={busy || !input.trim() || approvals.length > 0} className="btn btn-dark text-sm disabled:opacity-40">
          {busy ? "Working" : "Send"}
        </button>
      </form>
    </div>
  );
}
