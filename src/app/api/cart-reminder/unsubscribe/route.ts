// Unsubscribe from the cart reminder - the link in its footer and its
// List-Unsubscribe header. See lib/cart-reminders.
//
// GET ASKS, POST DOES IT. Mail scanners and link previews open every link in an
// email, so a GET that unsubscribed would unsubscribe people who never clicked.
// The page has one button that posts back here. Gmail and Apple Mail's own
// unsubscribe buttons POST straight here too (RFC 8058 one-click), with the same
// query string, so they work without the page.
import { unsubscribeCheckout, validUnsubscribeToken } from "@/lib/cart-reminders";
import { validCheckoutId } from "@/lib/checkout-leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${title} | MasterKraft</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#111;background:#fff}
button{font:inherit;padding:.6rem 1.2rem;background:#111;color:#fff;border:0;border-radius:4px;cursor:pointer}
a{color:inherit}</style></head>
<body><h1 style="font-size:1.4rem">${title}</h1>${body}<p style="margin-top:2rem"><a href="/">masterkraft.com</a></p></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function params(request: Request): { checkoutId: string; token: string } | null {
  const url = new URL(request.url);
  const checkoutId = validCheckoutId(url.searchParams.get("c"));
  const token = url.searchParams.get("t") ?? "";
  if (!checkoutId || !token || !validUnsubscribeToken(checkoutId, token)) return null;
  return { checkoutId, token };
}

const BAD_LINK = "This unsubscribe link isn't valid. Reply to the reminder email and we'll take you off by hand.";

export async function GET(request: Request) {
  const p = params(request);
  if (!p) return page("Link not recognised", `<p>${BAD_LINK}</p>`, 400);
  const action = `?c=${encodeURIComponent(p.checkoutId)}&t=${encodeURIComponent(p.token)}`;
  return page(
    "Stop cart reminders?",
    `<p>We'll stop sending you cart reminder emails, for this cart and any future one.</p>
     <form method="post" action="${action}"><button type="submit">Unsubscribe</button></form>`
  );
}

export async function POST(request: Request) {
  const p = params(request);
  if (!p) return page("Link not recognised", `<p>${BAD_LINK}</p>`, 400);
  try {
    await unsubscribeCheckout(p.checkoutId);
  } catch (e) {
    console.error("[cart-reminder/unsubscribe] failed", e instanceof Error ? e.message : e);
    return page(
      "Something went wrong",
      "<p>We couldn't unsubscribe you just now. Please try again, or reply to the reminder email and we'll do it by hand.</p>",
      500
    );
  }
  return page("You're unsubscribed", "<p>You won't get any more cart reminder emails from MasterKraft.</p>");
}
