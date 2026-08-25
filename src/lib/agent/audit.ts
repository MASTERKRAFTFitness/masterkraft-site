// The audit trail for the support desk.
//
// Answers one question that previously had no answer: who approved sending that,
// and what did they see when they decided?
//
// Everything here is best effort. A failed write is logged and swallowed, never
// raised, because an audit outage must not stop a staff member looking up an
// order for a customer on the phone. The trade is explicit: we would rather have
// a gap in the record than a console that stops working, and the gap is visible
// because the conversation id goes missing rather than the row being wrong.

import { adminDb } from "@/lib/admin-db";
import type { SessionPayload } from "@/lib/admin-auth";

export type AuditActor = { id: string; email: string };

/** Only real, database-backed identities are auditable. Shared mode has none. */
export function actorFrom(session: SessionPayload | null): AuditActor | null {
  if (!session?.sub || !session.email) return null;
  return { id: session.sub, email: session.email };
}

export async function startConversation(actor: AuditActor, firstMessage: string): Promise<string | null> {
  const db = adminDb();
  if (!db) return null;
  try {
    const { data, error } = await db
      .from("agent_conversations")
      .insert({
        user_id: actor.id,
        user_email: actor.email,
        // A trimmed first question makes the activity list scannable without
        // opening every thread.
        title: firstMessage.slice(0, 120),
      })
      .select("id")
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  } catch (e) {
    console.error("[audit] could not start conversation", e);
    return null;
  }
}

export async function recordMessage(
  conversationId: string | null,
  role: "user" | "assistant",
  content: unknown
): Promise<void> {
  const db = adminDb();
  if (!db || !conversationId) return;
  try {
    await db.from("agent_messages").insert({ conversation_id: conversationId, role, content });
    await db
      .from("agent_conversations")
      .update({ last_at: new Date().toISOString() })
      .eq("id", conversationId);
  } catch (e) {
    console.error("[audit] could not record message", e);
  }
}

/**
 * Record a write the agent WANTS to make. Written before anybody decides, so a
 * proposal nobody acted on still leaves a trace. That is the honest record: the
 * agent tried to email a customer and no human said yes.
 */
export async function recordProposal(
  conversationId: string | null,
  actor: AuditActor,
  toolUseId: string,
  toolName: string,
  input: unknown
): Promise<void> {
  const db = adminDb();
  if (!db || !conversationId) return;
  try {
    await db.from("agent_actions").upsert(
      {
        conversation_id: conversationId,
        user_id: actor.id,
        user_email: actor.email,
        tool_use_id: toolUseId,
        tool_name: toolName,
        input,
        decision: "proposed",
      },
      // tool_use_id is unique: a turn replayed after approval must not create a
      // second row for the same proposed action.
      { onConflict: "tool_use_id", ignoreDuplicates: true }
    );
  } catch (e) {
    console.error("[audit] could not record proposal", e);
  }
}

export async function recordDecision(
  toolUseId: string,
  decision: "approved" | "declined",
  result: unknown
): Promise<void> {
  const db = adminDb();
  if (!db) return;
  try {
    await db
      .from("agent_actions")
      .update({ decision, result: result ?? null, decided_at: new Date().toISOString() })
      .eq("tool_use_id", toolUseId);
  } catch (e) {
    console.error("[audit] could not record decision", e);
  }
}

export type ActivityRow = {
  id: number;
  user_email: string;
  tool_name: string;
  input: Record<string, unknown>;
  decision: string;
  proposed_at: string;
  decided_at: string | null;
};

/** Most recent write proposals and what happened to them. */
export async function recentActivity(limit = 50): Promise<ActivityRow[]> {
  const db = adminDb();
  if (!db) return [];
  const { data, error } = await db
    .from("agent_actions")
    .select("id, user_email, tool_name, input, decision, proposed_at, decided_at")
    .order("proposed_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[audit] could not read activity", error);
    return [];
  }
  return (data ?? []) as ActivityRow[];
}
