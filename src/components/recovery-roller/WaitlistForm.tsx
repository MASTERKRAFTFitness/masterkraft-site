"use client";

import { useState } from "react";
import {
  SITE_COUNT_OPTIONS,
  TIMEFRAME_OPTIONS,
} from "@/lib/recovery-roller";

type State = "idle" | "sending" | "done" | "error";

const labelCls =
  "block font-mono text-[0.68rem] uppercase tracking-[0.13em] text-[var(--color-ash)] mb-2";
const fieldCls =
  "w-full rounded-sm border border-[var(--color-line)] bg-white px-3 py-3 text-[0.95rem] " +
  "text-[var(--color-ink)] focus:border-transparent focus:outline-2 focus:outline-[var(--color-accent-600)]";

export default function WaitlistForm() {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Something went wrong.");
      setState("done");
      form.reset();
    } catch (err) {
      // Never tell someone they are on the list when they are not.
      setState("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (state === "done") {
    return (
      <div
        className="rounded-sm border border-[var(--color-line)] bg-white p-8 shadow-sm"
        role="status"
      >
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.13em] text-[var(--color-accent-600)]">
          You are on the list
        </p>
        <h3 className="mt-3 font-display text-2xl uppercase text-[var(--color-ink)]">
          Confirmed
        </h3>
        <p className="mt-3 text-[var(--color-ash)]">
          A confirmation is on its way. The full specification goes out the day it is
          finalised, and pricing follows. You will get both before they go out generally.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-sm border border-[var(--color-line)] bg-white p-6 shadow-sm sm:p-8"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="fullName">Full name</label>
          <input className={fieldCls} id="fullName" name="fullName" required autoComplete="name" />
        </div>

        <div>
          <label className={labelCls} htmlFor="email">Email</label>
          <input className={fieldCls} id="email" name="email" type="email" required autoComplete="email" />
        </div>

        <div>
          <label className={labelCls} htmlFor="phone">Mobile</label>
          <input className={fieldCls} id="phone" name="phone" type="tel" required autoComplete="tel" />
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="company">Gym or business</label>
          <input className={fieldCls} id="company" name="company" required autoComplete="organization" />
        </div>

        <div>
          <label className={labelCls} htmlFor="siteCount">How many sites</label>
          <select className={fieldCls} id="siteCount" name="siteCount" required defaultValue="">
            <option value="" disabled>Select</option>
            {SITE_COUNT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        <div>
          <label className={labelCls} htmlFor="timeframe">Timeframe</label>
          <select className={fieldCls} id="timeframe" name="timeframe" required defaultValue="">
            <option value="" disabled>Select</option>
            {TIMEFRAME_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>

      {/* Not pre-ticked, deliberately. */}
      <label className="mt-5 flex items-start gap-3 text-[0.86rem] leading-relaxed text-[var(--color-ash)]">
        <input
          type="checkbox"
          name="consent"
          required
          className="mt-1 h-4 w-4 flex-none accent-[var(--color-accent-600)]"
        />
        <span>
          Send me the Recovery Roller spec sheet and pricing, and occasional product
          updates from MasterKraft.
        </span>
      </label>

      {state === "error" && (
        <p className="mt-4 text-[0.9rem] text-[var(--color-accent-600)]" role="alert">
          {error} Please try again, or email{" "}
          <a className="underline" href="mailto:hello@masterkraft.com">hello@masterkraft.com</a>.
        </p>
      )}

      <button
        type="submit"
        disabled={state === "sending"}
        className="btn btn-accent mt-6 w-full justify-center disabled:opacity-60"
      >
        {state === "sending" ? "Sending…" : "Send me the spec and pricing"}
      </button>

      <p className="mt-4 text-center text-[0.78rem] text-[var(--color-ash)]">
        No newsletter. This list exists for this machine.
      </p>
    </form>
  );
}
