"use client";

// "Anything stopping you?" - optional, under the checkout form once freight has
// been quoted. One tap saves the answer to the checkout (api/checkout/reason);
// the team sees it in the abandoned-checkout alert if the shopper then leaves,
// so whoever follows up knows the objection before they call.
//
// OUTSIDE THE FORM ON PURPOSE. The form throws the freight quote away on any
// change, and these buttons and the note box must not.
import { useState } from "react";
import { ABANDON_REASONS, CHECKOUT_PAGE_REASONS, MAX_REASON_NOTE, type AbandonReason } from "@/lib/abandon-reasons";

const SHORT: Record<AbandonReason, string> = {
  freight: "Delivery cost or timing",
  quote: "Need a formal quote",
  question: "A question about the product",
  payment: ABANDON_REASONS.payment,
  comparing: "Still comparing",
  later: "Not ready yet",
  other: "Something else",
};

// Only what will really happen. A note reaches the team with the abandoned-
// checkout alert, an hour after they leave - not straight away - so nothing
// here promises a reply. Someone with a question now is pointed at the phone.
const FOLLOW_UP: Partial<Record<AbandonReason, string>> = {
  quote: "No problem. Request a quote below and we'll email you a formal one.",
  question: "Happy to help. Call us on (03) 9044 9575 and we'll talk it through.",
};

async function save(checkoutId: string, reason: AbandonReason, note?: string): Promise<boolean> {
  try {
    const res = await fetch("/api/checkout/reason", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkoutId, reason, note }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default function StoppingQuestion({
  checkoutId,
  onRequestQuote,
}: {
  checkoutId: string;
  /** Present when the card path is open; the quote button is already on screen otherwise. */
  onRequestQuote?: () => void;
}) {
  const [reason, setReason] = useState<AbandonReason | null>(null);
  const [note, setNote] = useState("");
  const [noteSent, setNoteSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function pick(r: AbandonReason) {
    setReason(r);
    setNoteSent(false);
    setBusy(true);
    setFailed(!(await save(checkoutId, r)));
    setBusy(false);
  }

  async function sendNote() {
    if (!reason || !note.trim()) return;
    setBusy(true);
    const ok = await save(checkoutId, reason, note);
    setFailed(!ok);
    setNoteSent(ok);
    setBusy(false);
  }

  return (
    <section aria-labelledby="stopping-question" className="mt-8 border border-line p-5">
      <h3 id="stopping-question" className="text-sm font-semibold">
        Anything stopping you? <span className="font-normal text-ash">(optional)</span>
      </h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {CHECKOUT_PAGE_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => pick(r)}
            disabled={busy}
            aria-pressed={reason === r}
            className={`border px-3 py-1.5 text-xs transition-colors disabled:opacity-60 ${
              reason === r ? "border-ink bg-ink text-white" : "border-line text-ink hover:border-ink"
            }`}
          >
            {SHORT[r]}
          </button>
        ))}
      </div>

      {reason && !failed && (
        <div className="mt-4 space-y-3 text-sm">
          <p className="text-ash">{FOLLOW_UP[reason] ?? "Thanks, that helps us."}</p>
          {reason === "quote" && onRequestQuote && (
            <button type="button" onClick={onRequestQuote} className="btn btn-out !text-ink w-full sm:w-auto">
              Request a Quote <span aria-hidden>→</span>
            </button>
          )}
          {noteSent ? (
            <p className="text-ash">Got it. Thanks for telling us.</p>
          ) : (
            <div className="space-y-2">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={MAX_REASON_NOTE}
                rows={3}
                aria-label="Anything you'd like to add? (optional)"
                placeholder="Anything you'd like to add? (optional)"
                className="w-full border border-line bg-white px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={sendNote}
                disabled={busy || !note.trim()}
                className="btn btn-out !text-ink w-full sm:w-auto disabled:opacity-60"
              >
                Send
              </button>
            </div>
          )}
        </div>
      )}
      {failed && <p className="mt-3 text-sm text-ash">That didn&apos;t save. You can call us on (03) 9044 9575 instead.</p>}
    </section>
  );
}
