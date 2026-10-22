"use client";

import { useRef, useState } from "react";
import { HoneypotField, guardValues, useFillTimer } from "@/components/forms/guard";
import { track, trackSignUp } from "@/lib/analytics";
import {
  BRANDING_OPTIONS,
  CONSENT_TEXT,
  NOT_SURE_WINDOW,
  PRODUCT_OPTIONS,
  SITE_OPTIONS,
  STATE_OPTIONS,
  windowLabel,
} from "@/lib/indie-iron";
import { useWindows } from "./useWindows";

type State = "idle" | "sending" | "done" | "error";

const labelCls = "mb-1.5 block text-[0.82rem] font-semibold text-[var(--ii-graphite)]";
const fieldCls =
  "w-full rounded-[4px] border-[1.5px] border-line bg-white px-3 py-[11px] text-base text-[var(--ii-graphite)] " +
  "focus:border-[var(--ii-cobalt)] focus:outline-none";
const chipCls =
  "inline-flex cursor-pointer items-center gap-2 rounded-full border-[1.5px] border-line bg-white px-3.5 py-[7px] " +
  "text-sm font-medium has-[:checked]:border-[var(--ii-cobalt)] has-[:checked]:text-[var(--ii-cobalt)]";
const Req = () => <span className="text-[var(--ii-cobalt)]"> *</span>;

const FORM_ID = "indie-iron";

export default function JoinForm() {
  const elapsed = useFillTimer();
  const { windows } = useWindows(4);
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState("");
  const [joined, setJoined] = useState<{ name: string; window: string } | null>(null);
  const started = useRef(false);

  // GA4 form_start, once, on the first field anyone touches.
  function onStart() {
    if (started.current) return;
    started.current = true;
    track("form_start", { form_id: FORM_ID });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const products = f.getAll("products").map(String);
    if (!products.length) {
      setState("error");
      setError("Please pick at least one product.");
      return;
    }
    const body = {
      firstName: String(f.get("firstName") ?? ""),
      lastName: String(f.get("lastName") ?? ""),
      email: String(f.get("email") ?? ""),
      phone: String(f.get("phone") ?? ""),
      company: String(f.get("company") ?? ""),
      state: String(f.get("state") ?? ""),
      sites: String(f.get("sites") ?? ""),
      window: String(f.get("window") ?? ""),
      products,
      branding: String(f.get("branding") ?? ""),
      message: String(f.get("message") ?? ""),
      consent: f.get("consent") === "on",
      ...guardValues(f, elapsed()),
    };
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/indie-iron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Something went wrong.");
      track("form_submit", { form_id: FORM_ID });
      trackSignUp(FORM_ID, body.email);
      const chosen = windows?.find((w) => windowLabel(w) === body.window);
      setJoined({ name: body.firstName, window: chosen?.name ?? windows?.[0]?.name ?? "next" });
      setState("done");
    } catch (err) {
      // Never say "you're in" when the sign-up was not recorded.
      setState("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (state === "done" && joined) {
    return (
      <div role="status" className="self-start rounded-md border border-line bg-white p-6 sm:p-8">
        <p className="font-mono text-[0.72rem] font-bold uppercase tracking-[0.16em] text-[var(--ii-cobalt)]">
          Welcome to Indie Iron, {joined.name}
        </p>
        <h3 className="ii-display mt-3 text-[2.4rem] leading-none text-[var(--ii-graphite)]">You&apos;re in.</h3>
        <p className="mt-4 text-ash">
          We&apos;ll email your member pricing and the order form for the {joined.window} window within one
          business day.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      onFocus={onStart}
      className="relative grid grid-cols-1 gap-[18px] rounded-md border border-line bg-white p-5 sm:grid-cols-2 sm:p-8"
    >
      <div>
        <label className={labelCls} htmlFor="ii-first">First name<Req /></label>
        <input className={fieldCls} id="ii-first" name="firstName" required autoComplete="given-name" />
      </div>
      <div>
        <label className={labelCls} htmlFor="ii-last">Last name<Req /></label>
        <input className={fieldCls} id="ii-last" name="lastName" required autoComplete="family-name" />
      </div>
      <div>
        <label className={labelCls} htmlFor="ii-email">Email<Req /></label>
        <input className={fieldCls} id="ii-email" name="email" type="email" required autoComplete="email" />
      </div>
      <div>
        <label className={labelCls} htmlFor="ii-phone">Mobile<Req /></label>
        <input className={fieldCls} id="ii-phone" name="phone" type="tel" required autoComplete="tel" />
      </div>
      <div>
        <label className={labelCls} htmlFor="ii-gym">Gym name<Req /></label>
        <input className={fieldCls} id="ii-gym" name="company" required autoComplete="organization" />
      </div>
      <div>
        <label className={labelCls} htmlFor="ii-state">State<Req /></label>
        <select className={fieldCls} id="ii-state" name="state" required defaultValue="">
          <option value="" disabled>Select</option>
          {STATE_OPTIONS.map((o) => <option key={o}>{o}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls} htmlFor="ii-sites">Number of sites</label>
        <select className={fieldCls} id="ii-sites" name="sites" defaultValue="">
          <option value="">Select</option>
          {SITE_OPTIONS.map((o) => <option key={o}>{o}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls} htmlFor="ii-window">Which window?</label>
        <select className={fieldCls} id="ii-window" name="window" defaultValue="">
          <option value="">Select</option>
          {windows?.map((w) => (
            <option key={w.id} value={windowLabel(w)}>{windowLabel(w)}</option>
          ))}
          <option value={NOT_SURE_WINDOW}>Not sure yet</option>
        </select>
      </div>

      <fieldset className="grid min-w-0 gap-2 sm:col-span-2">
        <legend className={labelCls}>What are you after?<Req /></legend>
        <div className="flex flex-wrap gap-2">
          {PRODUCT_OPTIONS.map((p) => (
            <label key={p} className={chipCls}>
              <input type="checkbox" name="products" value={p} className="accent-[var(--ii-cobalt)]" />
              {p}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid min-w-0 gap-2 sm:col-span-2">
        <legend className={labelCls}>Branding</legend>
        <div className="flex flex-wrap gap-2">
          {BRANDING_OPTIONS.map((b) => (
            <label key={b.value} className={chipCls}>
              <input type="radio" name="branding" value={b.value} className="accent-[var(--ii-cobalt)]" />
              {b.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor="ii-msg">
          Anything else? <span className="font-normal text-ash">(optional)</span>
        </label>
        <textarea
          className={fieldCls}
          id="ii-msg"
          name="message"
          rows={3}
          placeholder="e.g. opening a second site in March, need a full plate set"
        />
      </div>

      {/* Not pre-ticked, deliberately. */}
      <label className="flex items-start gap-2.5 text-[0.82rem] text-ash sm:col-span-2">
        <input type="checkbox" name="consent" required className="mt-[3px] h-4 w-4 flex-none accent-[var(--ii-cobalt)]" />
        <span>{CONSENT_TEXT}</span>
      </label>

      <HoneypotField />

      {state === "error" && (
        <p role="alert" className="text-sm text-[#C2362B] sm:col-span-2">
          {error} If it keeps happening, email{" "}
          <a className="underline" href="mailto:hello@masterkraft.com">hello@masterkraft.com</a>.
        </p>
      )}

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={state === "sending"}
          className="ii-btn w-full justify-center disabled:opacity-60 sm:w-auto"
        >
          {state === "sending" ? "Sending…" : "Join Indie Iron →"}
        </button>
      </div>
    </form>
  );
}
