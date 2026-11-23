import { NextResponse } from "next/server";
import { visitorKey } from "@/lib/agent/rate-limit";
import { evidenceProblem, type EvidenceFile } from "@/lib/warranty-evidence";
import { createUploadSlots } from "@/lib/warranty-evidence-store";

// Signed upload URLs for a warranty claim's photos and videos. The browser
// uploads straight to Supabase with them; see lib/warranty-evidence.ts.
//
// Rate limited per visitor because each call lets someone put up to 250 MB in
// our bucket. Per-instance memory, so a ceiling on casual abuse rather than a
// guarantee - same honest limitation as lib/agent/rate-limit.ts.

const WINDOW_MS = 10 * 60_000;
const PER_WINDOW = 6;
const hits = new Map<string, { count: number; resetAt: number }>();

function allowed(visitor: string, now = Date.now()): boolean {
  if (hits.size > 5000) for (const [k, h] of hits) if (h.resetAt <= now) hits.delete(k);
  const h = hits.get(visitor);
  if (!h || h.resetAt <= now) {
    hits.set(visitor, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  h.count += 1;
  return h.count <= PER_WINDOW;
}

export async function POST(request: Request) {
  let body: { files?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const files: EvidenceFile[] = Array.isArray(body.files)
    ? body.files.map((f) => {
        const o = (f ?? {}) as Record<string, unknown>;
        return { name: String(o.name ?? "").slice(0, 200), type: String(o.type ?? ""), size: Number(o.size ?? 0) };
      })
    : [];

  const problem = evidenceProblem(files);
  if (problem) return NextResponse.json({ ok: false, error: problem }, { status: 400 });

  if (!allowed(visitorKey(request))) {
    return NextResponse.json(
      { ok: false, error: "Too many uploads just now. Please wait a few minutes and try again." },
      { status: 429 }
    );
  }

  const slots = await createUploadSlots(files);
  if (!slots) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "We could not accept uploads just now. Please email hello@masterkraft.com with your " +
          "photos or video and the fault, and we will pick it up from there.",
      },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true, slots });
}
