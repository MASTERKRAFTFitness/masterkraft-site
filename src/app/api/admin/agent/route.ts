import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { adminCookieFrom, adminSecret, readSession } from "@/lib/admin-auth";
import {
  actorFrom,
  recordDecision,
  recordMessage,
  recordProposal,
  startConversation,
} from "@/lib/agent/audit";
import { SYSTEM_PROMPT } from "@/lib/agent/prompt";
import { TOOL_DEFINITIONS, describeToolCall, toolByName, type ToolInput } from "@/lib/agent/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MODEL = "claude-opus-5";
// A runaway guard, not a working limit. A real triage question resolves in two
// or three model turns; anything past this is a loop, not an answer.
const MAX_TURNS = 12;

type Approval = { tool_use_id: string; approved: boolean };

type ClientBody = {
  messages?: Anthropic.MessageParam[];
  approvals?: Approval[];
  /** Returned by a previous turn. Absent on the first message of a thread. */
  conversation_id?: string | null;
};

function hasToolUse(message: Anthropic.MessageParam | undefined): boolean {
  return (
    message?.role === "assistant" &&
    Array.isArray(message.content) &&
    message.content.some((b) => typeof b === "object" && b.type === "tool_use")
  );
}

export async function POST(request: Request) {
  // The proxy already gated this, but a route that hands out order data and can
  // send email re-checks rather than trusting the layer in front of it.
  const secret = adminSecret();
  const session = secret ? await readSession(adminCookieFrom(request), secret) : null;
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  // Null in shared-password mode, where there is no person to attribute to.
  const actor = actorFrom(session);
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set. Add it to .env.local and Vercel." },
      { status: 503 }
    );
  }

  let body: ClientBody;
  try {
    body = (await request.json()) as ClientBody;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? [...body.messages] : [];
  const approvals = Array.isArray(body.approvals) ? body.approvals : [];
  if (!messages.length) {
    return NextResponse.json({ error: "No messages supplied" }, { status: 400 });
  }

  const client = new Anthropic();
  const encoder = new TextEncoder();

  // Opened on the first turn of a thread and carried by the client afterwards,
  // so a whole conversation lands under one record rather than fragmenting.
  let conversationId = typeof body.conversation_id === "string" ? body.conversation_id : null;
  const lastUserText = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "user" && typeof m.content === "string") return m.content;
    }
    return "";
  })();
  if (actor && !conversationId && lastUserText) {
    conversationId = await startConversation(actor, lastUserText);
  }
  if (actor && lastUserText && approvals.length === 0) {
    await recordMessage(conversationId, "user", lastUserText);
  }

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        let awaitingApproval = false;

        for (let turn = 0; turn < MAX_TURNS && !awaitingApproval; turn++) {
          // Resume path: the client came back with approvals for an assistant
          // turn that already asked for tools, so resolve those before calling
          // the model again. Read tools re-run here; they are all idempotent.
          if (!hasToolUse(messages[messages.length - 1])) {
            const assistant = await runModelTurn(client, messages, emit);
            messages.push({ role: "assistant", content: assistant.content });
            if (actor) await recordMessage(conversationId, "assistant", assistant.content);
            if (assistant.stop_reason !== "tool_use") break;
            continue;
          }

          const last = messages[messages.length - 1] as Anthropic.MessageParam;
          const toolUses = (last.content as Anthropic.ContentBlockParam[]).filter(
            (b): b is Anthropic.ToolUseBlockParam => typeof b === "object" && b.type === "tool_use"
          );

          const results: Anthropic.ToolResultBlockParam[] = [];
          const pending: Anthropic.ToolUseBlockParam[] = [];

          for (const use of toolUses) {
            const tool = toolByName(use.name);
            const input = (use.input ?? {}) as ToolInput;

            if (!tool) {
              results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: `Unknown tool ${use.name}` });
              continue;
            }

            if (tool.write) {
              const decision = approvals.find((a) => a.tool_use_id === use.id);
              if (!decision) {
                pending.push(use);
                continue;
              }
              if (!decision.approved) {
                emit({ type: "tool", name: use.name, summary: describeToolCall(use.name, input), state: "declined" });
                if (actor) await recordDecision(use.id, "declined", null);
                results.push({
                  type: "tool_result",
                  tool_use_id: use.id,
                  content: "The operator declined this action. It was NOT carried out. Do not retry it; ask what they would like changed.",
                });
                continue;
              }
            }

            const summary = describeToolCall(use.name, input);
            emit({ type: "tool", name: use.name, summary, state: "running" });
            try {
              const output = await tool.run(input);
              emit({ type: "tool", name: use.name, summary, state: "done" });
              // Only writes are audited. Recording every catalogue search would
              // bury the two rows that actually matter.
              if (actor && tool.write) await recordDecision(use.id, "approved", output);
              results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(output) });
            } catch (e) {
              const message = e instanceof Error ? e.message : String(e);
              emit({ type: "tool", name: use.name, summary, state: "error" });
              if (actor && tool.write) await recordDecision(use.id, "approved", { error: message });
              results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: message });
            }
          }

          // A write is waiting on a human. Every tool_result for this assistant
          // turn has to arrive in one user message, so nothing is appended:
          // the client returns this same history plus its decisions, and the
          // read tools above run again on the way through.
          if (pending.length) {
            for (const use of pending) {
              // Written BEFORE anyone decides, so a proposal nobody acted on
              // still leaves a trace.
              if (actor) {
                await recordProposal(conversationId, actor, use.id, use.name, use.input);
              }
              emit({
                type: "approval",
                tool_use_id: use.id,
                name: use.name,
                summary: describeToolCall(use.name, (use.input ?? {}) as ToolInput),
                input: use.input,
              });
            }
            awaitingApproval = true;
            break;
          }

          messages.push({ role: "user", content: results });
        }

        emit({ type: "messages", messages, conversation_id: conversationId });
        emit({ type: "done", awaiting_approval: awaitingApproval });
      } catch (e) {
        console.error("[admin-agent]", e);
        emit({ type: "error", message: friendlyError(e) });
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

async function runModelTurn(
  client: Anthropic,
  messages: Anthropic.MessageParam[],
  emit: (event: Record<string, unknown>) => void
): Promise<Anthropic.Message> {
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive", display: "summarized" },
    output_config: { effort: "medium" },
    // Tools render before system, and both are stable, so the breakpoint here
    // caches the whole prefix. Keep TOOL_DEFINITIONS in a fixed order.
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    tools: TOOL_DEFINITIONS,
    messages,
  });

  stream.on("thinking", (delta) => emit({ type: "thinking", delta }));
  stream.on("text", (delta) => emit({ type: "text", delta }));

  return stream.finalMessage();
}

function friendlyError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "ANTHROPIC_API_KEY was rejected. Check the key.";
  if (e instanceof Anthropic.RateLimitError) return "Rate limited by the Claude API. Try again in a moment.";
  if (e instanceof Anthropic.APIError) return `Claude API error ${e.status}: ${e.message}`;
  return e instanceof Error ? e.message : "Something went wrong.";
}
