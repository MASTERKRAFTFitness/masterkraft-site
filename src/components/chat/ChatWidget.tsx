"use client";

// The public chat launcher and panel.
//
// Off unless NEXT_PUBLIC_CHAT_ENABLED is "true". That is on purpose: the agent
// behind it has never been checked against a live model, so the safe default for
// a page every customer sees is not present at all. Flipping the flag is the
// deliberate act of turning it on.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

const ENABLED = process.env.NEXT_PUBLIC_CHAT_ENABLED === "true";

type Msg = { role: "user" | "assistant"; content: string };

const GREETING =
  "Hi, I can help with products, stock, delivery costs and order progress. What are you after?";

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  // Follow the conversation as it streams, but never yank the page around when
  // someone has scrolled up to re-read an answer.
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 120;
    if (nearBottom) log.scrollTop = log.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else launcherRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;

    const history: Msg[] = [...messages, { role: "user", content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      if (!res.ok || !res.body) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error ?? "The assistant is unavailable right now.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let reply = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith("data:")) continue;
          let event: { type?: string; delta?: string; message?: string };
          try {
            event = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }
          if (event.type === "text" && event.delta) {
            reply += event.delta;
            setMessages([...history, { role: "assistant", content: reply }]);
          } else if (event.type === "error") {
            throw new Error(event.message ?? "Something went wrong.");
          }
        }
      }

      // A turn that ended with tool calls and no words would otherwise leave an
      // empty bubble sitting there.
      if (!reply.trim()) {
        setMessages([
          ...history,
          { role: "assistant", content: "Sorry, I could not put an answer together. Please try asking a different way." },
        ]);
      }
    } catch (e) {
      setMessages(history);
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, [input, busy, messages]);

  if (!ENABLED) return null;

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mk-chat-panel"
        className="fixed bottom-5 right-5 z-[55] flex items-center gap-2 bg-ink text-white px-5 py-3 font-mono text-xs uppercase tracking-widest shadow-lg hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent transition-colors"
      >
        {open ? "Close" : "Ask us"}
      </button>

      {open && (
        <div
          id="mk-chat-panel"
          role="dialog"
          aria-label="MasterKraft assistant"
          className="fixed z-[56] bg-white border border-line shadow-2xl flex flex-col inset-x-3 bottom-20 top-16 sm:inset-x-auto sm:top-auto sm:right-5 sm:bottom-20 sm:w-[24rem] sm:h-[34rem]"
        >
          <header className="px-4 py-3 border-b border-line bg-smoke">
            <p className="font-display uppercase tracking-wide text-sm text-ink">MasterKraft assistant</p>
            <p className="text-[11px] text-ash leading-snug mt-0.5">
              Automated. It can get things wrong, so check anything important with the team.
            </p>
          </header>

          <div ref={logRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3" aria-live="polite" aria-atomic="false">
            <Bubble role="assistant">{GREETING}</Bubble>

            {messages.map((m, i) => (
              <Bubble key={i} role={m.role}>
                {m.content || (busy && i === messages.length - 1 ? "…" : "")}
              </Bubble>
            ))}

            {error && (
              <p className="text-xs text-accent border border-accent/40 bg-accent/5 px-3 py-2">
                {error}{" "}
                <Link href="/contact" className="underline underline-offset-2">
                  Contact the team
                </Link>
                .
              </p>
            )}
          </div>

          <form
            className="border-t border-line p-3 flex gap-2 items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label htmlFor="mk-chat-input" className="sr-only">
              Your message
            </label>
            <textarea
              id="mk-chat-input"
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter for a new line: what a chat box does.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Ask about a product or delivery"
              maxLength={2000}
              // min-w-0 matters: a textarea has an intrinsic min-content width,
              // and without this flex-1 refuses to shrink below it, which pushes
              // the send button outside the panel on a phone.
              className="flex-1 min-w-0 resize-none border border-line px-3 py-2 text-sm focus:outline-none focus:border-ink max-h-28"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="shrink-0 bg-ink text-white px-4 py-2 font-mono text-xs uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent transition-colors"
            >
              {busy ? "…" : "Send"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function Bubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  const mine = role === "user";
  return (
    <div className={mine ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          mine
            ? "bg-ink text-white px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap"
            : "bg-smoke text-ink px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap"
        }
      >
        {children}
      </div>
    </div>
  );
}
