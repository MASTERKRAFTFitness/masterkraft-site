"use client";

import { useState } from "react";

export default function NewsletterForm() {
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSending(true);
    const email = new FormData(e.currentTarget).get("email");
    try {
      await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setDone(true);
    } catch {
      setDone(true); // fail soft — don't block the user
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return <p className="font-display uppercase tracking-wide text-accent-300">You&apos;re subscribed. Welcome aboard.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full md:w-auto">
      <input
        name="email"
        type="email"
        required
        aria-label="Your email address"
        placeholder="Your email address"
        className="flex-1 md:w-80 px-5 py-3.5 bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:outline-none focus:border-accent"
      />
      <button type="submit" disabled={sending} className="btn btn-accent disabled:opacity-60">
        {sending ? "…" : "Subscribe"}
      </button>
    </form>
  );
}
