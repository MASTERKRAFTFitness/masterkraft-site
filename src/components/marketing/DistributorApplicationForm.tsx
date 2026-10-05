"use client";

import { useState } from "react";
import { HoneypotField, guardValues, useFillTimer } from "@/components/forms/guard";
import { ENQUIRY_KIND } from "@/lib/enquiry-type";
import { trackEnquiry } from "@/lib/analytics";

const fieldClass =
  "w-full px-4 py-3 border border-line bg-white text-ink placeholder:text-ash/70 focus:outline-none focus:border-accent transition-colors";

const BUSINESS_TYPES = [
  "Fitness equipment retailer / specialist",
  "Gym fitout or installation business",
  "Sports or leisure wholesaler",
  "Independent agent",
  "Gym operator or group",
  "Other",
];

/**
 * The distributor application on /distributor.
 *
 * A front end on /api/contact rather than a route of its own: the contact route
 * already does the guard, HubSpot, and the email a person actually reads, and
 * `distributor` is one of its kinds. The extra questions - territory, business
 * type, brands carried - have no HubSpot property to land in, so they are folded
 * into `message` as labelled lines at the top. Same trick as the fitout brief:
 * nothing is lost to a human reading the notification, only to a CRM filter.
 */
export default function DistributorApplicationForm() {
  const elapsed = useFillTimer();
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSending(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const line = (label: string, key: string) => {
      const v = String(f.get(key) ?? "").trim();
      return v ? `${label}: ${v}` : null;
    };
    const message = [
      "Distributor application",
      line("Country / territory", "territory"),
      line("Business type", "businessType"),
      line("Website", "website"),
      line("Brands currently carried", "brands"),
      "",
      String(f.get("message") ?? "").trim(),
    ]
      .filter((l) => l !== null)
      .join("\n");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: f.get("firstName"),
          lastName: f.get("lastName"),
          email: f.get("email"),
          phone: f.get("phone"),
          company: f.get("company"),
          topic: ENQUIRY_KIND.distributor,
          message,
          ...guardValues(f, elapsed()),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Something went wrong.");
      trackEnquiry("distributor", String(f.get("email") ?? ""));
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="border border-accent bg-accent/5 p-8 text-center">
        <p className="font-display uppercase tracking-wide text-lg">Application received</p>
        <p className="mt-2 text-ash">
          Thank you. Our partnerships team will review your market and be in touch to arrange an
          introductory call.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <input name="firstName" required aria-label="First name" placeholder="First name" className={fieldClass} />
        <input name="lastName" required aria-label="Last name" placeholder="Last name" className={fieldClass} />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <input name="email" required type="email" aria-label="Email" placeholder="Email" className={fieldClass} />
        <input name="phone" aria-label="Phone" placeholder="Phone (with country code)" className={fieldClass} />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <input name="company" required aria-label="Company name" placeholder="Company name" className={fieldClass} />
        <input name="website" aria-label="Website" placeholder="Website" className={fieldClass} />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <input
          name="territory"
          required
          aria-label="Country or territory"
          placeholder="Country / territory you'd cover"
          className={fieldClass}
        />
        <select name="businessType" required aria-label="Business type" className={fieldClass} defaultValue="">
          <option value="" disabled>
            Type of business…
          </option>
          {BUSINESS_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <input
        name="brands"
        aria-label="Brands currently carried"
        placeholder="Brands you currently carry (if any)"
        className={fieldClass}
      />
      <textarea
        name="message"
        required
        rows={5}
        aria-label="Tell us about your market"
        placeholder="Tell us about your market: who you sell to, your sales and install capability, and where you see the opportunity."
        className={fieldClass}
      />
      <HoneypotField />
      {error && <p className="text-accent-600 text-sm">{error}</p>}
      <button type="submit" disabled={sending} className="btn btn-accent w-full sm:w-auto disabled:opacity-60">
        {sending ? "Sending…" : "Submit Application"} <span aria-hidden>→</span>
      </button>
      <p className="text-xs text-ash">
        All information is treated with the strictest confidence.
      </p>
    </form>
  );
}
