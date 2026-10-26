// "What stopped you?" - the links in the cart reminder. See lib/cart-reminders.
//
// GET ASKS, POST RECORDS, for the same reason as unsubscribe: mail scanners and
// link previews open every link in an email, so a GET that recorded would file
// every reason at once for people who never clicked. The page comes up with
// the clicked answer already chosen, room to say more, and one button.
//
// The answer goes on the checkout (abandon_reason) and to the team, with
// reply-to set to the shopper so a "need a quote" can be answered straight away.
// Re-sending the same answer stores nothing new and sends no second email.
import {
  ABANDON_REASONS,
  MAX_REASON_NOTE,
  recordAbandonReason,
  reasonTeamEmail,
  resend,
  validAbandonReason,
  validReasonToken,
  type AbandonReason,
} from "@/lib/cart-reminders";
import { validCheckoutId } from "@/lib/checkout-leads";
import { internalRecipients } from "@/lib/notify-recipients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escape(s: string) {
  return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] || c);
}

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${title} | MasterKraft</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#111;background:#fff}
button{font:inherit;padding:.6rem 1.2rem;background:#111;color:#fff;border:0;border-radius:4px;cursor:pointer}
label{display:block;margin:.4rem 0;cursor:pointer}textarea{font:inherit;width:100%;box-sizing:border-box;padding:.5rem;margin:.4rem 0 1rem}
a{color:inherit}</style></head>
<body><h1 style="font-size:1.4rem">${title}</h1>${body}<p style="margin-top:2rem"><a href="/">masterkraft.com</a></p></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function signed(url: URL): { checkoutId: string; token: string } | null {
  const checkoutId = validCheckoutId(url.searchParams.get("c"));
  const token = url.searchParams.get("t") ?? "";
  if (!checkoutId || !token || !validReasonToken(checkoutId, token)) return null;
  return { checkoutId, token };
}

const BAD_LINK = "This link isn't valid. You can always reply to the reminder email and tell us there.";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const p = signed(url);
  if (!p) return page("Link not recognised", `<p>${BAD_LINK}</p>`, 400);
  const chosen = validAbandonReason(url.searchParams.get("r"));
  const action = `?c=${encodeURIComponent(p.checkoutId)}&t=${encodeURIComponent(p.token)}`;
  const options = (Object.keys(ABANDON_REASONS) as AbandonReason[])
    .map(
      (r) =>
        `<label><input type="radio" name="reason" value="${r}"${r === chosen ? " checked" : ""} required> ${escape(ABANDON_REASONS[r])}</label>`
    )
    .join("");
  return page(
    "What stopped you?",
    `<form method="post" action="${action}">
       ${options}
       <p style="margin:1rem 0 0">Anything you'd like to add? (optional)</p>
       <textarea name="note" rows="4" maxlength="${MAX_REASON_NOTE}" aria-label="Anything you'd like to add?"></textarea>
       <button type="submit">Send</button>
     </form>`
  );
}

export async function POST(request: Request) {
  const p = signed(new URL(request.url));
  if (!p) return page("Link not recognised", `<p>${BAD_LINK}</p>`, 400);
  const form = await request.formData().catch(() => null);
  const reason = validAbandonReason(form?.get("reason"));
  if (!reason) return page("Pick an answer", "<p>Please go back and choose one of the options.</p>", 400);
  const note = form?.get("note");

  try {
    const result = await recordAbandonReason(p.checkoutId, reason, typeof note === "string" ? note : null);
    if (!result) return page("Link not recognised", `<p>${BAD_LINK}</p>`, 404);
    if (result.changed) {
      // The answer is saved either way; a failed team email is logged, not shown.
      const { subject, html } = reasonTeamEmail(result.row);
      await resend({ to: internalRecipients(), reply_to: result.row.email ?? undefined, subject, html }).catch((e) =>
        console.error("[cart-reminder/reason] team email failed", p.checkoutId, e instanceof Error ? e.message : e)
      );
    }
  } catch (e) {
    console.error("[cart-reminder/reason] failed", e instanceof Error ? e.message : e);
    return page(
      "Something went wrong",
      "<p>We couldn't save that just now. Please try again, or reply to the reminder email and tell us there.</p>",
      500
    );
  }
  const next =
    reason === "quote"
      ? "We'll put a formal quote together and email it to you."
      : reason === "question" || reason === "payment"
        ? "Someone from the team will be in touch to help."
        : "It helps us a lot.";
  return page("Thanks for telling us", `<p>${next}</p><p><a href="/cart">Back to your cart</a></p>`);
}
