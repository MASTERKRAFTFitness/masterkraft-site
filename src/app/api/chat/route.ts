// The public website assistant.
//
// Deliberately NOT under /api/admin: that prefix is gated by src/proxy.ts and
// this endpoint is meant to be open. Everything that makes it safe to be open
// lives here and in public-tools.ts, so read both before changing either.
//
// Differences from the internal desk at /api/admin/agent that matter:
//
//  1. No approval loop. There is no operator behind a public widget, so the
//     whole tool loop completes inside one request and only the visible
//     transcript goes back to the browser.
//  2. The client's history is rebuilt, not trusted. Only plain text turns are
//     accepted. A public endpoint hands its conversation state to an untrusted
//     browser, so a forged tool_result claiming "this rower is $40" is a
//     screenshot waiting to happen. Dropping every non-text block removes the
//     vector rather than validating it.
//  3. It is rate limited and it uses a cheaper model, because every message
//     costs money and anyone on the internet can send one.

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { PUBLIC_SYSTEM_PROMPT } from "@/lib/agent/public-prompt";
import { PUBLIC_TOOL_DEFINITIONS, publicToolByName, type PublicContext } from "@/lib/agent/public-tools";
import { checkMessageLimit, visitorKey } from "@/lib/agent/rate-limit";
import { sanitiseHistory } from "@/lib/agent/history";
import type { ToolInput } from "@/lib/agent/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 60 rather than the desk's 300. A visitor watching a chat box will not wait
// five minutes, and 60 is honoured on every Vercel plan, so this one does not
// depend on the plan question still open in HANDOFF.md.
export const maxDuration = 60;

// Sonnet, not Opus. The desk runs Opus because a staff member is making a
// decision off the answer and there are a handful of them. This endpoint is open
// to the internet at a few cents a conversation, and the work (look it up, say
// it plainly) is well within Sonnet. Change the constant if that stops being
// true; nothing else depends on it.
const MODEL = "claude-sonnet-5";

// A customer question resolves in two or three turns. Past this it is a loop.
const MAX_TURNS = 8;
// Replies are meant to be short, and max_tokens is the per-turn cost ceiling.
const MAX_TOKENS = 1500;

export async function POST(request: Request) {
  const visitor = visitorKey(request);

  const limit = checkMessageLimit(visitor);
  if (!limit.ok) {
    return NextResponse.json(
      { error: limit.reason },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    // Fails closed and says nothing useful to a visitor. The detail is in the
    // server log, where it belongs.
    console.error("[chat] ANTHROPIC_API_KEY is not set");
    return NextResponse.json(
      { error: "The assistant is not available right now. Please use the contact form and the team will help." },
      { status: 503 }
    );
  }

  let body: { messages?: unknown };
  try {
    body = (await request.json()) as { messages?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const messages = sanitiseHistory(body.messages);
  if (!messages.length) {
    return NextResponse.json({ error: "No message supplied" }, { status: 400 });
  }

  const client = new Anthropic();
  const encoder = new TextEncoder();
  const ctx: PublicContext = { visitor };

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        for (let turn = 0; turn < MAX_TURNS; turn++) {
          const assistant = await runTurn(client, messages, emit);
          messages.push({ role: "assistant", content: assistant.content });
          if (assistant.stop_reason !== "tool_use") break;

          const uses = assistant.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
          );
          const results: Anthropic.ToolResultBlockParam[] = [];

          for (const use of uses) {
            const tool = publicToolByName(use.name);
            if (!tool) {
              // Only reachable if the model hallucinates a tool name, but an
              // internal tool name arriving here would be worth knowing about.
              console.warn("[chat] unknown tool requested:", use.name);
              results.push({
                type: "tool_result",
                tool_use_id: use.id,
                is_error: true,
                content: "That tool is not available.",
              });
              continue;
            }
            // The browser is told a lookup is happening, never which tool or
            // what it returned.
            emit({ type: "working" });
            try {
              const output = await tool.run((use.input ?? {}) as ToolInput, ctx);
              results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(output) });
            } catch (e) {
              console.error("[chat] tool failed:", use.name, e);
              results.push({
                type: "tool_result",
                tool_use_id: use.id,
                is_error: true,
                content: "That lookup failed. Tell the customer you could not check it and offer to pass it to the team.",
              });
            }
          }

          messages.push({ role: "user", content: results });
        }

        emit({ type: "done" });
      } catch (e) {
        console.error("[chat]", e);
        // Visitors get one wording for every failure. The specific reason (bad
        // key, rate limit, outage) is ours, not theirs.
        emit({
          type: "error",
          message: "Something went wrong at our end. Please try again, or use the contact form and the team will help.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

async function runTurn(
  client: Anthropic,
  messages: Anthropic.MessageParam[],
  emit: (event: Record<string, unknown>) => void
): Promise<Anthropic.Message> {
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    // Tools render before system and both are byte-stable, so this breakpoint
    // caches the whole prefix. Keep PUBLIC_TOOL_DEFINITIONS in a fixed order.
    system: [{ type: "text", text: PUBLIC_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    tools: PUBLIC_TOOL_DEFINITIONS,
    messages,
  });

  // Text only. No thinking is streamed to a public page: it is the one channel
  // that would narrate how the order check works to the person testing it.
  stream.on("text", (delta) => emit({ type: "text", delta }));

  return stream.finalMessage();
}
