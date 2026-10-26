// The welcome email a gym gets after signing up on /indie-iron.
//
// Sent by /api/indie-iron once the sign-up is recorded (HubSpot or the team
// email). It confirms the window they chose and the exact moment it closes,
// and says what happens next. The brief's editing rules in lib/indie-iron.ts
// apply here too: no "cheap", no pricing tiers, nothing on where the gear is
// made. The 6–8 week lead time is the Indie Iron exception and is fine here.
//
// Inline styles and a text wordmark rather than the SVG logo: Gmail and Outlook
// strip <style> blocks and will not render SVG images.

import {
  type BuyWindow,
  formatClose,
  formatLanding,
  upcomingWindows,
  windowFromLabel,
} from "@/lib/indie-iron";

export const WELCOME_SUBJECT = "Welcome to Indie Iron";

/** The pricing claims. Match the page; change both together. */
export const WELCOME_PRICING = "up to 20% off the website price";
export const WELCOME_MEMBER_PRICING = "10% off the website price";

const GRAPHITE = "#16191D";
const COBALT = "#2350D8";
const ASH = "#5B6169";

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Which window the email talks about, and how. A gym that picked "Not sure" (or
 * nothing) is pointed at the next open window. One that picked a window which
 * closed between loading the page and pressing submit is told their order rolls
 * into the next one, as the FAQ promises, rather than given a date in the past.
 */
function resolveWindow(label: string, now: Date): { window: BuyWindow; intro: string } {
  const next = upcomingWindows(now, 1)[0];
  const chosen = windowFromLabel(label);
  const closes = (w: BuyWindow) => `<strong>23:59 Melbourne time on ${formatClose(w)}</strong>`;
  if (!chosen) {
    return {
      window: next,
      intro: `You haven't picked a buy window yet, and that's fine. The next one is the
        <strong>${next.name}</strong>, which closes ${closes(next)}.`,
    };
  }
  if (chosen.closesAt.getTime() <= now.getTime()) {
    return {
      window: next,
      intro: `The ${chosen.name} window closed just before your sign-up came through, so your
        order rolls into the <strong>${next.name}</strong>, which closes ${closes(next)}.`,
    };
  }
  return {
    window: chosen,
    intro: `You've chosen the <strong>${chosen.name}</strong> window. It closes ${closes(chosen)}.`,
  };
}

export function welcomeEmail(
  s: { firstName: string; company: string; window: string },
  now = new Date()
): { subject: string; html: string } {
  const { window: w, intro } = resolveWindow(s.window, now);
  const step = (n: number, title: string, body: string) => `
    <tr>
      <td valign="top" style="padding:0 14px 16px 0;font:700 14px/22px Arial,sans-serif;color:${COBALT}">${n}</td>
      <td style="padding:0 0 16px;font:15px/22px Arial,sans-serif;color:${GRAPHITE}">
        <strong>${title}</strong><br><span style="color:${ASH}">${body}</span>
      </td>
    </tr>`;

  const html = `
<div style="background:#F3F4F6;padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-collapse:collapse">
    <tr>
      <td style="background:${GRAPHITE};padding:20px 28px;font:700 13px/18px Arial,sans-serif;letter-spacing:3px;color:#fff">
        MASTERKRAFT <span style="color:#5B82FF">INDIE IRON</span>
      </td>
    </tr>
    <tr>
      <td style="padding:28px 28px 8px;font:15px/23px Arial,sans-serif;color:${GRAPHITE}">
        <p style="margin:0 0 16px">Hi ${escape(s.firstName)},</p>
        <p style="margin:0 0 16px">Welcome to Indie Iron. ${escape(s.company)} is now a member of
        MasterKraft's buying group for independent gyms. Membership is free, and there's no lock-in.</p>
        <p style="margin:0 0 16px">${intro}</p>
        <p style="margin:0 0 24px">You get <strong>${WELCOME_MEMBER_PRICING}</strong> on all MasterKraft
        equipment, any time. Order in a buy window and it's <strong>${WELCOME_PRICING}</strong>,
        depending on the product, with your logo on plates, kettlebells, medicine balls, dumbbells
        and fixed barbells.</p>
        <p style="margin:0 0 12px;font:700 12px/18px Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:${COBALT}">What happens next</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          ${step(1, "Your pricing and order form", `Within one business day we'll email your member pricing and the order form for the ${w.name} window.`)}
          ${step(2, "Build your order", "Pick your range and weights, then send your logo as a vector file. We send a proof for each item, and nothing goes into production until you approve it.")}
          ${step(3, "The window closes", `Orders close at 23:59 Melbourne time on ${formatClose(w)}. All member orders go into one production run. Deposit on close, balance before dispatch.`)}
          ${step(4, "On your floor", `Delivered 6–8 weeks after the window closes, expected ${formatLanding(w)}.`)}
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 28px 28px;font:15px/23px Arial,sans-serif;color:${GRAPHITE}">
        <p style="margin:0 0 16px">Questions in the meantime? Just reply to this email.</p>
        <p style="margin:0">The MasterKraft team</p>
      </td>
    </tr>
    <tr>
      <td style="border-top:1px solid #E5E7EB;padding:16px 28px;font:12px/18px Arial,sans-serif;color:${ASH}">
        You're getting this because you joined Indie Iron at
        <a href="https://masterkraft.com/indie-iron" style="color:${ASH}">masterkraft.com/indie-iron</a>.
      </td>
    </tr>
  </table>
</div>`;

  return { subject: WELCOME_SUBJECT, html };
}
