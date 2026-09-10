import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetFormLimits,
  checkFormSubmission,
  generatedFields,
  impossibleDate,
  looksGenerated,
  ELAPSED_FIELD,
  HONEYPOT_FIELD,
  MIN_ELAPSED_MS,
  PER_WINDOW,
  PER_DAY,
} from "./form-guard";

// The submission that started this: a real warranty claim bot, 9 September 2026,
// forwarded by Steve. Every field is generator output. If a change to the
// heuristics ever lets this one through, the tests should say so.
const REAL_SPAM = {
  fullName: "Jymyyqqw",
  company: "Asdnusg LLC",
  product: "vUwHtWUifxAvLRekCeOlIDT",
  sku: "AAXsDqSbZIObDvYqte",
  orderRef: "OzLUwWfDoiXpWrGTn",
  fault: "ForlvKQIQhZVEMOFcElc",
};

const post = (body: Record<string, unknown>, ip = "203.0.113.1") =>
  new Request("https://masterkraft.com/api/warranty-claim", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });

const claim = (over: Record<string, unknown> = {}) => ({
  fullName: "Sarah Nguyen",
  company: "Northside Strength",
  product: "Recovery Roller",
  sku: "MK-RR-450",
  orderRef: "INV-2026-8837",
  fault: "The belt slips under load and the motor cuts out after about ten minutes.",
  [ELAPSED_FIELD]: 45_000,
  ...over,
});

/** Drop a key, for the cases that turn on a field being absent entirely. */
const without = (obj: Record<string, unknown>, key: string) => {
  const copy = { ...obj };
  delete copy[key];
  return copy;
};

const guard = (body: Record<string, unknown>, ip?: string, now?: number) =>
  checkFormSubmission(post(body, ip), body, {
    form: "warranty",
    fields: {
      fullName: String(body.fullName ?? ""),
      company: String(body.company ?? ""),
      product: String(body.product ?? ""),
      sku: String(body.sku ?? ""),
      orderRef: String(body.orderRef ?? ""),
      fault: String(body.fault ?? ""),
    },
    dates: { purchaseDate: String(body.purchaseDate ?? "") },
    now,
  });

describe("looksGenerated", () => {
  it("catches the random-case strings the bot produces", () => {
    expect(looksGenerated("vUwHtWUifxAvLRekCeOlIDT")).toBe(true);
    expect(looksGenerated("AAXsDqSbZIObDvYqte")).toBe(true);
    expect(looksGenerated("OzLUwWfDoiXpWrGTn")).toBe(true);
    expect(looksGenerated("ForlvKQIQhZVEMOFcElc")).toBe(true);
  });

  // The expensive mistake here is not a bot getting through, it is a real
  // customer with a broken machine being silently dropped.
  it("leaves ordinary words, names and brands alone", () => {
    for (const word of [
      "MasterKraft", "Engineered", "dumbbell", "Callanan", "Thomastown",
      "Krzysztof", "Nguyen", "OConnell", "kettlebell", "Strzelecki",
      "McDonald", "JavaScript", "iPhone", "DeWalt", "Bartholomew",
    ]) {
      expect(looksGenerated(word), word).toBe(false);
    }
  });

  it("leaves real product and order codes alone", () => {
    for (const code of ["MKRB450X", "RECOVERY", "INV202688371", "SBR1200XL"]) {
      expect(looksGenerated(code), code).toBe(false);
    }
  });

  it("ignores anything too short to judge", () => {
    expect(looksGenerated("aBcDeF")).toBe(false);
  });
});

describe("impossibleDate", () => {
  const now = Date.parse("2026-09-10T00:00:00Z");

  it("rejects the epoch-adjacent date the bot sends", () => {
    expect(impossibleDate("1970-05-31", now)).toBe(true);
  });

  it("rejects a purchase in the future", () => {
    expect(impossibleDate("2027-01-01", now)).toBe(true);
  });

  it("accepts a genuinely old purchase, because equipment lasts", () => {
    expect(impossibleDate("1998-03-14", now)).toBe(false);
  });

  it("stays out of the way when the field is blank or unparseable", () => {
    expect(impossibleDate("", now)).toBe(false);
    expect(impossibleDate("about three years ago", now)).toBe(false);
  });
});

describe("generatedFields", () => {
  it("names the fields that gave it away", () => {
    expect(generatedFields(REAL_SPAM).sort()).toEqual(["fault", "orderRef", "product", "sku"]);
  });

  it("finds nothing in a real claim", () => {
    expect(generatedFields(without(claim(), ELAPSED_FIELD) as Record<string, string>)).toEqual([]);
  });
});

describe("checkFormSubmission", () => {
  beforeEach(() => __resetFormLimits());

  it("blocks the real spam submission", () => {
    const verdict = guard({ ...REAL_SPAM, purchaseDate: "1970-05-31", [ELAPSED_FIELD]: 40_000 });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("gibberish");
  });

  it("lets a real claim through", () => {
    expect(guard(claim()).ok).toBe(true);
  });

  it("blocks on the honeypot alone, however human the rest looks", () => {
    const verdict = guard(claim({ [HONEYPOT_FIELD]: "http://cheap-seo.example" }));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("honeypot");
  });

  it("ignores a honeypot that is present but empty, which is what a browser sends", () => {
    expect(guard(claim({ [HONEYPOT_FIELD]: "" })).ok).toBe(true);
  });

  it("blocks a form filled faster than a person can type", () => {
    const verdict = guard(claim({ [ELAPSED_FIELD]: 300 }));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("too_fast");
  });

  it("accepts a submission right on the floor", () => {
    expect(guard(claim({ [ELAPSED_FIELD]: MIN_ELAPSED_MS })).ok).toBe(true);
  });

  // Anyone holding the JS bundle from before this shipped sends no elapsed time,
  // and so does a legitimate direct API caller. Neither is a bot.
  it("does not block when the elapsed time is missing or unreadable", () => {
    expect(guard(without(claim(), ELAPSED_FIELD)).ok).toBe(true);
    expect(guard(claim({ [ELAPSED_FIELD]: "not a number" })).ok).toBe(true);
  });

  // One unusual-looking value is a person; two is a generator.
  it("does not block on a single odd-looking field", () => {
    expect(guard(claim({ sku: "vUwHtWUifxAvLRekCeOlIDT" })).ok).toBe(true);
  });

  it("blocks once a second field agrees", () => {
    const verdict = guard(claim({ sku: "vUwHtWUifxAvLRekCeOlIDT", product: "OzLUwWfDoiXpWrGTn" }));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("gibberish");
  });

  it("counts an impossible purchase date as one of the two signals", () => {
    const verdict = guard(
      claim({ sku: "vUwHtWUifxAvLRekCeOlIDT", purchaseDate: "1970-05-31" }),
      "203.0.113.2",
      Date.parse("2026-09-10T00:00:00Z")
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("gibberish");
  });

  it("stops a flood from one address", () => {
    for (let i = 0; i < PER_WINDOW; i++) {
      expect(guard(claim(), "198.51.100.7").ok, `submission ${i}`).toBe(true);
    }
    const verdict = guard(claim(), "198.51.100.7");
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("rate_limit");
  });

  it("does not let one address's flood block another", () => {
    for (let i = 0; i < PER_WINDOW + 3; i++) guard(claim(), "198.51.100.8");
    expect(guard(claim(), "198.51.100.9").ok).toBe(true);
  });

  // Otherwise the cheapest layer to trip becomes the one that costs us the most
  // requests: trip the honeypot forever, never exhaust the allowance.
  it("counts blocked submissions towards the cap too", () => {
    for (let i = 0; i < PER_WINDOW; i++) {
      guard(claim({ [HONEYPOT_FIELD]: "spam" }), "198.51.100.10");
    }
    const verdict = guard(claim(), "198.51.100.10");
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("rate_limit");
  });

  it("still caps the day once the short window keeps resetting", () => {
    let clock = Date.parse("2026-09-10T00:00:00Z");
    let allowed = 0;
    for (let i = 0; i < PER_DAY + 10; i++) {
      if (guard(claim(), "198.51.100.11", clock).ok) allowed++;
      clock += 11 * 60_000; // always a fresh window
    }
    expect(allowed).toBe(PER_DAY);
  });
});
