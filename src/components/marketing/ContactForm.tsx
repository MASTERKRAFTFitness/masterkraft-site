"use client";

import { useState } from "react";

const fieldClass =
  "w-full px-4 py-3 border border-line bg-white text-ink placeholder:text-ash/70 focus:outline-none focus:border-accent transition-colors";

export default function ContactForm() {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSending(true);
    setError(null);
    const f = new FormData(e.currentTarget);
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
          topic: f.get("topic"),
          message: f.get("message"),
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
        <p className="font-display uppercase tracking-wide text-lg">Thank you</p>
        <p className="mt-2 text-ash">
          We&apos;ve received your enquiry and will be in touch shortly.
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
        <input name="phone" aria-label="Phone" placeholder="Phone" className={fieldClass} />
      </div>
      <input name="company" aria-label="Company / gym name" placeholder="Company / gym name" className={fieldClass} />
      <select name="topic" aria-label="Enquiry topic" className={fieldClass} defaultValue="">
        <option value="" disabled>
          I&apos;m enquiring about…
        </option>
        <option>Equipment purchase</option>
        <option>A fit-out solution</option>
        <option>Becoming a distributor</option>
        <option>Wholesale / portal access</option>
        <option>Something else</option>
      </select>
      <textarea name="message" required rows={5} aria-label="How can we help?" placeholder="How can we help?" className={fieldClass} />
      {error && <p className="text-accent-600 text-sm">{error}</p>}
      <button type="submit" disabled={sending} className="btn btn-accent w-full sm:w-auto disabled:opacity-60">
        {sending ? "Sending…" : "Send Enquiry"} <span aria-hidden>→</span>
      </button>
    </form>
  );
}
