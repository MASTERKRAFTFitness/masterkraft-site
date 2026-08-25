// Rebuilding the conversation the browser sends back.
//
// The public chat endpoint is stateless: the browser holds the transcript and
// returns it with every message. That means the history is attacker-controlled.
// A forged assistant turn, or a forged tool_result claiming a rower costs $40,
// would be repeated back by the model and screenshotted.
//
// So nothing structural is trusted. Only plain text turns survive, and the tool
// results the model needs are re-fetched inside the request instead. Dropping
// the vector beats validating it.

import type Anthropic from "@anthropic-ai/sdk";

export const MAX_MESSAGES = 20;
export const MAX_CHARS_PER_MESSAGE = 2000;
export const MAX_CHARS_TOTAL = 12000;

type ClientMessage = { role?: unknown; content?: unknown };

export function sanitiseHistory(raw: unknown): Anthropic.MessageParam[] {
  if (!Array.isArray(raw)) return [];
  const out: Anthropic.MessageParam[] = [];
  let total = 0;

  for (const item of raw.slice(-MAX_MESSAGES) as ClientMessage[]) {
    const role = item?.role;
    if (role !== "user" && role !== "assistant") continue;
    // Anything that is not a plain string is a structured block: tool_use,
    // tool_result, images. None of them can be trusted from a browser.
    if (typeof item.content !== "string") continue;
    const text = item.content.trim().slice(0, MAX_CHARS_PER_MESSAGE);
    if (!text) continue;
    if (total + text.length > MAX_CHARS_TOTAL) break;
    total += text.length;
    // The API rejects two turns from the same role in a row, and dropping
    // messages above can easily produce that.
    if (out.length && out[out.length - 1].role === role) {
      out[out.length - 1] = { role, content: text };
      continue;
    }
    out.push({ role, content: text });
  }

  // It must also start with a user turn.
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}
