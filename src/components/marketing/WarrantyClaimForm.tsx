"use client";

import { useState } from "react";

// Matches ContactForm's field styling so the two read as one system.
const fieldClass =
  "w-full px-4 py-3 border border-line bg-white text-ink placeholder:text-ash/70 focus:outline-none focus:border-accent transition-colors";

export default function WarrantyClaimForm() {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSending(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/warranty-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: f.get("fullName"),
          email: f.get("email"),
          phone: f.get("phone"),
          company: f.get("company"),
          product: f.get("product"),
          sku: f.get("sku"),
          orderRef: f.get("orderRef"),
          purchaseDate: f.get("purchaseDate"),
          fault: f.get("fault"),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Something went wrong.");
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
        <p className="font-display uppercase tracking-wide text-lg">Claim lodged</p>
        <p className="mt-2 text-ash">
          We&apos;ve sent a confirmation to your email. Our team will review the fault against the
          warranty terms and come back to you.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <input name="fullName" required aria-label="Full name" placeholder="Full name" className={fieldClass} />
        <input name="company" aria-label="Gym or business (optional)" placeholder="Gym or business (optional)" className={fieldClass} />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <input name="email" required type="email" aria-label="Email" placeholder="Email" className={fieldClass} />
        <input name="phone" required aria-label="Phone" placeholder="Phone" className={fieldClass} />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <input name="product" required aria-label="Product" placeholder="Product" className={fieldClass} />
        <input name="sku" aria-label="Product code (optional)" placeholder="Product code, if known" className={fieldClass} />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <input name="orderRef" aria-label="Order or invoice number (optional)" placeholder="Order or invoice number" className={fieldClass} />
        <div>
          <label htmlFor="wc-purchase-date" className="sr-only">
            Approximate purchase date
          </label>
          {/* A date input shows no placeholder, so it needs a visible label. */}
          <input
            id="wc-purchase-date"
            name="purchaseDate"
            type="date"
            aria-label="Approximate purchase date"
            className={fieldClass}
          />
          <p className="mt-1 font-mono text-[10px] tracking-widest uppercase text-ash">
            Approximate purchase date
          </p>
        </div>
      </div>

      <textarea
        name="fault"
        required
        rows={5}
        aria-label="Describe the fault"
        placeholder="Describe the fault: what happens, when it started, and how the equipment is used."
        className={fieldClass}
      />

      <p className="text-ash text-sm">
        Photographs help us assess a claim quickly. Reply to the confirmation email with images
        once you receive it.
      </p>

      {error && <p className="text-accent-600 text-sm">{error}</p>}
      <button type="submit" disabled={sending} className="btn btn-accent w-full sm:w-auto disabled:opacity-60">
        {sending ? "Sending…" : "Lodge Warranty Claim"} <span aria-hidden>→</span>
      </button>
    </form>
  );
}
