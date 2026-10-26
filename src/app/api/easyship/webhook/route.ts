// Easyship webhook: label bought -> tracking number stored for the shipped email.
//
// Logic:    lib/easyship-webhook.ts.
// Register: Easyship -> Integrations -> API & Webhooks -> Webhooks, URL
//           https://masterkraft.com/api/easyship/webhook, events
//           shipment.label.created and shipment.tracking.status.changed. Copy
//           its `webh_...` secret into EASYSHIP_WEBHOOK_SECRET first.
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/admin-db";
import { describeSignature, handleEvent, verifySignature, type EasyshipEvent } from "@/lib/easyship-webhook";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // FAIL CLOSED: without the secret nothing can be verified, so nothing is stored.
  const secret = process.env.EASYSHIP_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.warn("[easyship/webhook] refused: EASYSHIP_WEBHOOK_SECRET is not set");
    return NextResponse.json({ ok: false, error: "not configured" }, { status: 503 });
  }
  const signature = req.headers.get("x-easyship-signature");
  if (!verifySignature(signature, secret)) {
    // Shapes only (see describeSignature), plus which signature-like headers
    // arrived, in case Easyship names it differently from its docs.
    const headers = [...req.headers.keys()].filter((k) => /sign|auth|easyship/i.test(k));
    console.warn("[easyship/webhook] refused: bad signature", { ...describeSignature(signature, secret), headers });
    return NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  let event: EasyshipEvent;
  try {
    event = (await req.json()) as EasyshipEvent;
  } catch {
    // Signed but unreadable: retrying will not fix it, so do not ask for a retry.
    console.error("[easyship/webhook] signed event with an unreadable body");
    return NextResponse.json({ ok: true, ignored: "unreadable body" });
  }

  const db = adminDb();
  if (!db) {
    console.error("[easyship/webhook] Supabase is not configured");
    return NextResponse.json({ ok: false, error: "storage unavailable" }, { status: 503 });
  }
  try {
    const result = await handleEvent(event, db);
    console.log("[easyship/webhook]", event.event_type, result);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    // A storage failure is worth Easyship's retry: it comes back in a minute.
    const error = e instanceof Error ? e.message : String(e);
    console.error("[easyship/webhook] could not store", { type: event.event_type, error });
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
