import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckoutLeadRow } from "./checkout-leads";

// A tiny in-memory stand-in for the Supabase query builder: just the filters
// sendCartReminders uses, applied for real, so the claim / opt-out / one-per-
// address rules are tested against rows rather than against mock call counts.
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let patch: Row | null = null;
  let upsert: Row | null = null;
  let order: { col: string; asc: boolean } | null = null;
  let limit = Infinity;
  const q = {
    select: () => q,
    update: (p: Row) => ((patch = p), q),
    upsert: (p: Row) => ((upsert = p), q),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
    is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), q),
    in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q),
    not: (c: string, _op: string, v: unknown) => (filters.push((r) => (r[c] ?? null) !== v), q),
    gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), q),
    lt: (c: string, v: string) => (filters.push((r) => String(r[c]) < v), q),
    order: (col: string, o: { ascending: boolean }) => ((order = { col, asc: o.ascending }), q),
    limit: (n: number) => ((limit = n), q),
    maybeSingle: () => q.then((res: { data: Row[] }) => ({ data: res.data[0] ?? null, error: null })),
    then(resolve: (v: { data: Row[]; error: null }) => unknown) {
      const rows = (tables[table] ??= []);
      if (upsert) {
        if (!rows.some((r) => r.email === upsert!.email)) rows.push({ ...upsert });
        return Promise.resolve(resolve({ data: [], error: null }));
      }
      let hit = rows.filter((r) => filters.every((f) => f(r)));
      if (patch) hit.forEach((r) => Object.assign(r, patch));
      if (order) {
        const { col, asc } = order;
        hit = [...hit].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
      }
      return Promise.resolve(resolve({ data: hit.slice(0, limit), error: null }));
    },
  };
  return q;
}

vi.mock("@/lib/admin-db", () => ({ adminDb: () => ({ from: query }) }));

const {
  ABANDON_REASONS,
  inSendWindow,
  reasonTeamEmail,
  reasonUrl,
  recordAbandonReason,
  reminderEmail,
  reminderRange,
  sendCartReminders,
  unsubscribeUrl,
  validReasonToken,
  validUnsubscribeToken,
} = await import("./cart-reminders");

// 23 Oct 2026, 10:00 in Melbourne (AEDT, UTC+11).
const MORNING = new Date("2026-10-22T23:00:00Z");

const lead = (over: Partial<CheckoutLeadRow> = {}): CheckoutLeadRow => ({
  checkout_id: "1efdb65f-0044-40ce-83e3-56855a3f0ea2",
  status: "quoted",
  name: "Violet Atkinson",
  email: "violet@example.com",
  phone: "0400000000",
  company: null,
  suburb: "Chelsea",
  state: "VIC",
  postcode: "3196",
  items: [{ sku: "MWWLACC01", name: "Barbell Squat Pad", qty: 1, price: 20 }],
  subtotal: 20,
  freight_price: 10.42,
  freight_label: "Aramex Domestic",
  freight_reason: null,
  order_number: null,
  notified_at: null,
  reminder_opt_in: true,
  reminded_at: null,
  created_at: "2026-10-22T09:00:00.000Z",
  // 22 Oct, 8pm Melbourne: the evening before MORNING.
  updated_at: "2026-10-22T09:00:00.000Z",
  abandon_reason: null,
  abandon_reason_note: null,
  abandon_reason_at: null,
  ...over,
});

describe("when it sends", () => {
  it("sends between 9am and 6pm Melbourne time only", () => {
    expect(inSendWindow(new Date("2026-10-22T21:59:00Z"))).toBe(false); // 8:59am
    expect(inSendWindow(new Date("2026-10-22T22:00:00Z"))).toBe(true); // 9:00am
    expect(inSendWindow(new Date("2026-10-23T06:59:00Z"))).toBe(true); // 5:59pm
    expect(inSendWindow(new Date("2026-10-23T07:00:00Z"))).toBe(false); // 6:00pm
  });

  it("reminds carts left an hour ago or more, not last week's", () => {
    const { after, before } = reminderRange(MORNING);
    expect(before.toISOString()).toBe("2026-10-22T22:00:00.000Z");
    expect(after.toISOString()).toBe("2026-10-20T23:00:00.000Z");
  });
});

describe("unsubscribe link", () => {
  beforeEach(() => vi.stubEnv("CRON_SECRET", "s3cret"));
  afterEach(() => vi.unstubAllEnvs());

  it("carries the checkout id and a signature, never the email", () => {
    const url = unsubscribeUrl("1efdb65f-0044-40ce-83e3-56855a3f0ea2")!;
    expect(url).toContain("/api/cart-reminder/unsubscribe?c=1efdb65f-0044-40ce-83e3-56855a3f0ea2&t=");
    expect(url).not.toContain("@");
    const token = new URL(url).searchParams.get("t")!;
    expect(validUnsubscribeToken("1efdb65f-0044-40ce-83e3-56855a3f0ea2", token)).toBe(true);
  });

  it("rejects a token for another checkout, or a forged one", () => {
    const token = new URL(unsubscribeUrl("1efdb65f-0044-40ce-83e3-56855a3f0ea2")!).searchParams.get("t")!;
    expect(validUnsubscribeToken("eeb3b8b2-fd8a-4fbe-8783-483cfe2263b8", token)).toBe(false);
    expect(validUnsubscribeToken("1efdb65f-0044-40ce-83e3-56855a3f0ea2", "nope")).toBe(false);
  });
});

describe("the email", () => {
  it("lists the cart and freight, says why it came, and how to stop it", () => {
    const { subject, html } = reminderEmail(lead(), "https://masterkraft.com/u?c=x&t=y");
    expect(subject).toBe("Your MasterKraft cart");
    expect(html).toContain("Hi Violet,");
    expect(html).toContain("Barbell Squat Pad");
    expect(html).toContain("$10.42");
    expect(html).toContain("Email me my cart if I don't finish");
    expect(html).toContain('href="https://masterkraft.com/u?c=x&amp;t=y"');
    expect(html).toContain("MasterKraft Pty Ltd · ABN 84 659 220 274");
  });

  it("asks what stopped them, one signed link per reason", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const { html } = reminderEmail(lead(), "https://x");
    expect(html).toContain("what stopped you?");
    for (const label of Object.values(ABANDON_REASONS)) expect(html).toContain(label);
    expect(html).toContain("/api/cart-reminder/reason?c=1efdb65f-0044-40ce-83e3-56855a3f0ea2&amp;r=quote&amp;t=");
    vi.unstubAllEnvs();
  });

  it("doesn't ask again when they already answered on the checkout page", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const { html } = reminderEmail(lead({ abandon_reason: "freight" }), "https://x");
    expect(html).not.toContain("what stopped you?");
    vi.unstubAllEnvs();
  });

  it("leaves the question out rather than send dead links", () => {
    const { html } = reminderEmail(lead(), "https://x", () => null);
    expect(html).not.toContain("what stopped you?");
  });

  it("does not invent a freight price it never had", () => {
    const { html } = reminderEmail(lead({ freight_price: null }), "https://x");
    expect(html).toContain("we'll confirm the price with you");
  });

  it("escapes what the shopper typed", () => {
    const { html } = reminderEmail(lead({ name: "<b>Vi</b>" }), "https://x");
    expect(html).toContain("Hi &lt;b&gt;Vi&lt;/b&gt;,");
  });
});

describe("sendCartReminders", () => {
  let sent: { to: string[]; headers: Record<string, string> }[];
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("QUOTE_FROM_EMAIL", "MasterKraft <quotes@masterkraft.com>");
    vi.stubEnv("QUOTE_TO_EMAIL", "hello@masterkraft.com");
    tables.checkout_leads = [];
    tables.cart_reminder_optouts = [];
    sent = [];
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)));
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.fetch = realFetch;
  });

  const rows = () => tables.checkout_leads as unknown as CheckoutLeadRow[];

  it("emails an opted-in cart once, with a one-click unsubscribe header", async () => {
    tables.checkout_leads.push(lead());
    expect(await sendCartReminders(MORNING)).toMatchObject({ ok: true, sent: 1 });
    expect(sent[0].to).toEqual(["violet@example.com"]);
    expect(sent[0].headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(rows()[0].reminded_at).toBe(MORNING.toISOString());

    expect(await sendCartReminders(MORNING)).toMatchObject({ sent: 0 });
    expect(sent).toHaveLength(1);
  });

  it("never emails a shopper who left the box unticked", async () => {
    tables.checkout_leads.push(lead({ reminder_opt_in: false }));
    expect(await sendCartReminders(MORNING)).toMatchObject({ candidates: 0, sent: 0 });
  });

  it("never emails an address that unsubscribed, whatever this checkout says", async () => {
    tables.checkout_leads.push(lead({ email: "Violet@Example.com" }));
    tables.cart_reminder_optouts.push({ email: "violet@example.com" });
    expect(await sendCartReminders(MORNING)).toMatchObject({ optedOut: 1, sent: 0 });
    expect(sent).toHaveLength(0);
  });

  it("waits an hour, and leaves paid and quoted orders alone", async () => {
    tables.checkout_leads.push(
      // 9:30am, half an hour before MORNING: not left long enough yet.
      lead({ checkout_id: "recent-000000000000", email: "a@example.com", updated_at: "2026-10-22T22:30:00.000Z" }),
      lead({ checkout_id: "paid-00000000000000", email: "b@example.com", status: "paid" }),
      lead({ checkout_id: "quote-0000000000000", email: "c@example.com", status: "quote_requested" }),
      lead({ checkout_id: "old-000000000000000", email: "d@example.com", updated_at: "2026-10-15T09:00:00.000Z" })
    );
    expect(await sendCartReminders(MORNING)).toMatchObject({ candidates: 0, sent: 0 });
    expect(await sendCartReminders(new Date("2026-10-22T20:00:00Z"))).toMatchObject({ skipped: expect.any(String) });
  });

  it("sends an hour after a lunchtime checkout, the same day", async () => {
    // Left at 11:55am: the 12:30 run is too soon, the 1:00pm run reminds it.
    tables.checkout_leads.push(lead({ updated_at: "2026-10-23T00:55:00.000Z" }));
    expect(await sendCartReminders(new Date("2026-10-23T01:30:00Z"))).toMatchObject({ sent: 0 });
    expect(await sendCartReminders(new Date("2026-10-23T02:00:00Z"))).toMatchObject({ sent: 1 });
  });

  it("holds an evening checkout until 9am", async () => {
    // Left at 5:30pm; 6:30pm is after hours, so 9am the next day.
    tables.checkout_leads.push(lead({ updated_at: "2026-10-22T06:30:00.000Z" }));
    expect(await sendCartReminders(new Date("2026-10-22T07:30:00Z"))).toMatchObject({ skipped: expect.any(String) });
    expect(await sendCartReminders(MORNING)).toMatchObject({ sent: 1 });
  });

  it("sends one email per address, for the newest cart, and marks the other", async () => {
    tables.checkout_leads.push(
      lead({ checkout_id: "older-0000000000000", updated_at: "2026-10-21T09:00:00.000Z", subtotal: 1 }),
      lead({ checkout_id: "newer-0000000000000", updated_at: "2026-10-22T09:00:00.000Z", subtotal: 20 })
    );
    expect(await sendCartReminders(MORNING)).toMatchObject({ sent: 1 });
    expect(String((sent[0] as unknown as { html: string }).html)).toContain("$20.00");
    expect(rows().every((r) => r.reminded_at)).toBe(true);
  });

  it("releases the claim when the send fails, so the next run retries", async () => {
    tables.checkout_leads.push(lead());
    globalThis.fetch = (async () => new Response("down", { status: 500 })) as unknown as typeof fetch;
    expect(await sendCartReminders(MORNING)).toMatchObject({ sent: 0, failed: 1 });
    expect(rows()[0].reminded_at).toBeNull();
  });
});

describe("what stopped them", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    tables.checkout_leads = [lead()];
  });
  afterEach(() => vi.unstubAllEnvs());

  const ID = "1efdb65f-0044-40ce-83e3-56855a3f0ea2";

  it("signs reason links apart from unsubscribe links", () => {
    const reasonToken = new URL(reasonUrl(ID, "quote")!).searchParams.get("t")!;
    const unsubToken = new URL(unsubscribeUrl(ID)!).searchParams.get("t")!;
    expect(validReasonToken(ID, reasonToken)).toBe(true);
    expect(validReasonToken(ID, unsubToken)).toBe(false);
    expect(validUnsubscribeToken(ID, reasonToken)).toBe(false);
  });

  it("stores the answer, and says when a resubmit changed nothing", async () => {
    expect(await recordAbandonReason(ID, "quote", "  For our club in Geelong  ")).toMatchObject({ changed: true });
    expect(tables.checkout_leads[0]).toMatchObject({ abandon_reason: "quote", abandon_reason_note: "For our club in Geelong" });
    expect(await recordAbandonReason(ID, "quote", "For our club in Geelong")).toMatchObject({ changed: false });
    expect(await recordAbandonReason(ID, "freight", null)).toMatchObject({ changed: true });
    expect(tables.checkout_leads[0]).toMatchObject({ abandon_reason: "freight", abandon_reason_note: null });
  });

  it("returns null for a checkout it does not know", async () => {
    expect(await recordAbandonReason("eeb3b8b2-fd8a-4fbe-8783-483cfe2263b8", "other", null)).toBeNull();
  });

  it("tells the team what they said, escaped, with the cart", () => {
    const { subject, html } = reasonTeamEmail(lead({ abandon_reason: "quote", abandon_reason_note: "<i>asap</i>" }));
    expect(subject).toBe("Why they didn't finish: I need a formal quote or invoice first - Violet Atkinson");
    expect(html).toContain("Please send one.");
    expect(html).toContain("&lt;i&gt;asap&lt;/i&gt;");
    expect(html).toContain("Barbell Squat Pad");
  });
});
