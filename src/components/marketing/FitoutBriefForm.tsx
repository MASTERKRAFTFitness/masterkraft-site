"use client";

// The fit-out brief wizard - the conversion path on /contact, and where the
// header's "Fit-Out Solution" CTA lands.
//
// WHY FIVE STEPS AND NOT ONE LONG FORM: this asks for eleven things. Shown at
// once that is a wall a visitor bounces off; shown five at a time, each step is
// two or three taps and the contact details come last, once they have already
// invested the effort. Same fields, a fraction of the perceived cost.
//
// WHAT IS ACTUALLY REQUIRED: step 1 (both picks) and step 5 (name + email).
// Steps 2-4 are all skippable, deliberately - someone gathering concepts for a
// build next year does not know their ceiling height, and a required field they
// cannot answer loses a lead we would otherwise have nurtured. briefLines() drops
// what they skip rather than padding it.
//
// A11Y: the tap-cards are real <input type="radio"|"checkbox"> elements inside
// <label>s, visually hidden with sr-only and styled through `has-[:checked]`.
// They are NOT divs with onClick, so arrow-key groups, screen-reader state and
// the browser's own focus handling all come for free. Each group is a <fieldset>
// with a <legend>.

import { useRef, useState } from "react";
import { HoneypotField, guardValues, useFillTimer } from "@/components/forms/guard";
import { trackEnquiry, track } from "@/lib/analytics";
import BriefIcon from "@/components/marketing/BriefIcon";
import {
  ACCEPTED_UPLOAD_TYPES,
  MAX_FILES,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  areaUnits,
  brandingOptions,
  budgetOptions,
  emptyBrief,
  heightUnits,
  humanBytes,
  obstacleOptions,
  projectStages,
  projectTypes,
  timelineOptions,
  zoneOptions,
  type Choice,
  type FitoutBrief,
} from "@/lib/fitout-brief";

const STEPS = ["Project", "Space", "Zones", "Budget", "Details"];

const fieldClass =
  "w-full px-4 py-3 border border-line bg-white text-ink placeholder:text-ash/70 focus:outline-none focus:border-accent transition-colors";

/** Shared tap-card chrome. `has-[:checked]` is what paints the selected state. */
const cardClass =
  "group relative flex flex-col gap-2 border border-line bg-white p-4 text-left cursor-pointer transition-all duration-200 " +
  "hover:border-ash hover:-translate-y-0.5 " +
  "has-[:checked]:border-accent has-[:checked]:bg-accent/5 has-[:checked]:-translate-y-0.5 " +
  "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent";

function TapCard({
  choice,
  type,
  name,
  checked,
  onChange,
}: {
  choice: Choice;
  type: "radio" | "checkbox";
  name: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className={cardClass}>
      <input
        type={type}
        name={name}
        value={choice.value}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span className="flex items-start justify-between gap-3">
        {choice.icon ? (
          <BriefIcon
            name={choice.icon}
            className="h-7 w-7 shrink-0 text-ash transition-colors group-has-[:checked]:text-accent-600"
          />
        ) : (
          <span />
        )}
        {/* The tick is the only confirmation on the icon-less grids, so it is
            drawn rather than relying on the border shift alone. */}
        <span
          aria-hidden
          className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center border border-line text-transparent transition-colors group-has-[:checked]:border-accent group-has-[:checked]:bg-accent group-has-[:checked]:text-ink"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M3.5 8.5l3 3 6-6.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </span>
      <span className="font-display uppercase tracking-wide text-sm leading-tight">
        {choice.label}
      </span>
      {choice.hint && <span className="text-ash text-xs leading-relaxed">{choice.hint}</span>}
    </label>
  );
}

/** A heading + helper line, repeated at the top of each step. */
function StepHeading({ title, help }: { title: string; help: string }) {
  return (
    <div className="mb-6">
      <h3 className="text-2xl lg:text-3xl font-bold leading-tight">{title}</h3>
      <p className="mt-2 text-ash leading-relaxed">{help}</p>
    </div>
  );
}

function Legend({ children }: { children: React.ReactNode }) {
  return (
    <legend className="font-mono text-[11px] tracking-widest uppercase text-accent-600 mb-3">
      {children}
    </legend>
  );
}

export default function FitoutBriefForm() {
  const elapsed = useFillTimer();
  const headingRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState(0);
  const [brief, setBrief] = useState<FitoutBrief>(emptyBrief);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  // The route reports whether the customer's confirmation actually sent. The
  // receipt tells them to "reply to the confirmation email", which is only true
  // advice when one exists - so the copy follows the result rather than assuming.
  const [confirmed, setConfirmed] = useState(false);

  const set = <K extends keyof FitoutBrief>(key: K, value: FitoutBrief[K]) =>
    setBrief((b) => ({ ...b, [key]: value }));

  const toggle = (key: "obstacles" | "zones", value: string) =>
    setBrief((b) => ({
      ...b,
      [key]: b[key].includes(value) ? b[key].filter((v) => v !== value) : [...b[key], value],
    }));

  // Step 1 needs both picks to route the lead; step 5 needs a way to reply.
  // Nothing in between blocks - see the note at the top of this file.
  const stepValid =
    step === 0
      ? Boolean(brief.projectType && brief.stage)
      : step === 4
        ? Boolean(brief.firstName.trim() && brief.email.trim())
        : true;

  function goTo(next: number) {
    setStep(next);
    setError(null);
    // Moving back a step scrolls the wizard's own heading into view rather than
    // the page top, so the visitor does not lose the form on a phone.
    headingRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function next() {
    if (!stepValid) return;
    // Which step a visitor stops on is the only way to see where this form leaks.
    track("fitout_brief_step", { step: step + 2, name: STEPS[step + 1] });
    goTo(step + 1);
  }

  function addFiles(incoming: FileList | null) {
    if (!incoming?.length) return;
    setFileError(null);
    const accepted = ACCEPTED_UPLOAD_TYPES.split(",");
    const nextFiles = [...files];
    const problems: string[] = [];

    for (const file of Array.from(incoming)) {
      if (nextFiles.length >= MAX_FILES) {
        problems.push(`Up to ${MAX_FILES} files.`);
        break;
      }
      // A phone photo of a sketch can come through with an empty type, so the
      // extension is the fallback rather than an outright reject.
      const looksAccepted =
        accepted.includes(file.type) ||
        /\.(png|jpe?g|webp|heic|heif|pdf)$/i.test(file.name);
      if (!looksAccepted) {
        problems.push(`${file.name} is not an image or PDF.`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        problems.push(`${file.name} is over ${humanBytes(MAX_FILE_BYTES)}.`);
        continue;
      }
      if (nextFiles.some((f) => f.name === file.name && f.size === file.size)) continue;
      nextFiles.push(file);
    }

    const total = nextFiles.reduce((sum, f) => sum + f.size, 0);
    if (total > MAX_TOTAL_BYTES) {
      setFileError(`That is over ${humanBytes(MAX_TOTAL_BYTES)} in total. Try fewer files.`);
      return;
    }
    setFiles(nextFiles);
    if (problems.length) setFileError(problems.join(" "));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!stepValid) return;
    setSending(true);
    setError(null);

    const body = new FormData();
    // The brief travels as one JSON part so the route parses a typed object
    // instead of nineteen loose form entries.
    body.append("brief", JSON.stringify(brief));
    const guard = guardValues(new FormData(e.currentTarget), elapsed());
    for (const [key, value] of Object.entries(guard)) {
      if (value !== undefined) body.append(key, String(value));
    }
    files.forEach((file) => body.append("plans", file, file.name));

    try {
      const res = await fetch("/api/fitout-brief", { method: "POST", body });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Something went wrong.");
      trackEnquiry("fitout-brief", brief.email);
      setConfirmed(data.confirmed === "sent");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="mk-step-in border border-accent bg-white p-8 lg:p-10 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center bg-accent text-ink">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h3 className="mt-6 text-2xl font-bold">Brief received</h3>
        <p className="mt-3 text-ash leading-relaxed">
          Thanks {brief.firstName.trim() || "-"}, your brief is with our design team. We come
          back within one business day with a concept and an indicative price.
        </p>
        <p className="mt-4 text-ash text-sm leading-relaxed">
          {confirmed ? (
            <>
              Anything to add - a photo of the space, a revised plan - just reply to the
              confirmation email we have sent to {brief.email.trim()}.
            </>
          ) : (
            <>
              Anything to add - a photo of the space, a revised plan - email it to{" "}
              <a
                href="mailto:hello@masterkraft.com"
                className="text-ink underline decoration-accent underline-offset-2"
              >
                hello@masterkraft.com
              </a>{" "}
              and we will add it to your brief.
            </>
          )}
        </p>
        <a href="tel:+61390449575" className="btn btn-accent mt-7">
          Or call +61 3 9044 9575
        </a>
      </div>
    );
  }

  const pct = ((step + (stepValid ? 1 : 0.35)) / STEPS.length) * 100;

  return (
    <form
      onSubmit={handleSubmit}
      className="@container bg-white border border-line shadow-[0_1px_0_rgba(0,0,0,0.04)]"
      noValidate
    >
      {/* Progress */}
      <div className="border-b border-line px-6 lg:px-8 pt-6 pb-5">
        <div className="flex items-baseline justify-between gap-4">
          <p className="font-mono text-[11px] tracking-widest uppercase text-accent-600">
            Step {step + 1} of {STEPS.length} — {STEPS[step]}
          </p>
          <p className="font-mono text-[11px] tracking-widest uppercase text-ash">
            {step === 4 ? "Last one" : "~90 seconds"}
          </p>
        </div>
        <div
          className="mt-3 h-1 w-full bg-line overflow-hidden"
          role="progressbar"
          aria-valuenow={step + 1}
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-label="Brief progress"
        >
          <div
            className="h-full bg-accent transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div ref={headingRef} className="px-6 lg:px-8 py-8">
        {/* STEP 1 - project type + stage */}
        {step === 0 && (
          <div className="mk-step-in">
            <StepHeading
              title="What are we building?"
              help="Two taps and we know which of our design teams should pick this up."
            />
            <fieldset className="border-0 p-0 m-0">
              <Legend>Fit-out type</Legend>
              <div className="mk-stagger grid @sm:grid-cols-2 @xl:grid-cols-3 gap-3">
                {projectTypes.map((c) => (
                  <TapCard
                    key={c.value}
                    choice={c}
                    type="radio"
                    name="projectType"
                    checked={brief.projectType === c.value}
                    onChange={() => set("projectType", c.value)}
                  />
                ))}
              </div>
            </fieldset>
            <fieldset className="border-0 p-0 m-0 mt-8">
              <Legend>Where are you up to?</Legend>
              <div className="mk-stagger grid @sm:grid-cols-3 gap-3">
                {projectStages.map((c) => (
                  <TapCard
                    key={c.value}
                    choice={c}
                    type="radio"
                    name="stage"
                    checked={brief.stage === c.value}
                    onChange={() => set("stage", c.value)}
                  />
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {/* STEP 2 - dimensions */}
        {step === 1 && (
          <div className="mk-step-in">
            <StepHeading
              title="Tell us about the space"
              help="Rough numbers are genuinely fine - we confirm everything at site measure."
            />
            <div className="grid @md:grid-cols-2 gap-5">
              <div>
                <label htmlFor="floorArea" className="font-mono text-[11px] tracking-widest uppercase text-accent-600">
                  Floor area
                </label>
                <div className="mt-2 flex">
                  <input
                    id="floorArea"
                    inputMode="decimal"
                    placeholder="e.g. 220"
                    value={brief.floorArea}
                    onChange={(e) => set("floorArea", e.target.value)}
                    className={`${fieldClass} border-r-0`}
                  />
                  <select
                    aria-label="Floor area unit"
                    value={brief.areaUnit}
                    onChange={(e) => set("areaUnit", e.target.value)}
                    className="px-3 border border-line bg-smoke font-mono text-xs uppercase tracking-widest focus:outline-none focus:border-accent"
                  >
                    {areaUnits.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="ceilingHeight" className="font-mono text-[11px] tracking-widest uppercase text-accent-600">
                  Ceiling height
                </label>
                <div className="mt-2 flex">
                  <input
                    id="ceilingHeight"
                    inputMode="decimal"
                    placeholder="e.g. 3.2"
                    value={brief.ceilingHeight}
                    onChange={(e) => set("ceilingHeight", e.target.value)}
                    className={`${fieldClass} border-r-0`}
                  />
                  <select
                    aria-label="Ceiling height unit"
                    value={brief.heightUnit}
                    onChange={(e) => set("heightUnit", e.target.value)}
                    className="px-3 border border-line bg-smoke font-mono text-xs uppercase tracking-widest focus:outline-none focus:border-accent"
                  >
                    {heightUnits.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="mt-2 text-ash text-xs leading-relaxed">
                  This one decides whether a full rig or a squat rack fits, so it is worth a
                  tape measure.
                </p>
              </div>
            </div>
            <fieldset className="border-0 p-0 m-0 mt-8">
              <Legend>Anything in the way? (select all that apply)</Legend>
              <div className="mk-stagger grid @sm:grid-cols-2 @xl:grid-cols-3 gap-3">
                {obstacleOptions.map((c) => (
                  <TapCard
                    key={c.value}
                    choice={c}
                    type="checkbox"
                    name="obstacles"
                    checked={brief.obstacles.includes(c.value)}
                    onChange={() => toggle("obstacles", c.value)}
                  />
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {/* STEP 3 - zones + branding */}
        {step === 2 && (
          <div className="mk-step-in">
            <StepHeading
              title="What goes on the floor?"
              help="Pick the zones you want and we lay them out around your dimensions."
            />
            <fieldset className="border-0 p-0 m-0">
              <Legend>Training zones (select all that apply)</Legend>
              <div className="mk-stagger grid grid-cols-2 @lg:grid-cols-4 gap-3">
                {zoneOptions.map((c) => (
                  <TapCard
                    key={c.value}
                    choice={c}
                    type="checkbox"
                    name="zones"
                    checked={brief.zones.includes(c.value)}
                    onChange={() => toggle("zones", c.value)}
                  />
                ))}
              </div>
            </fieldset>
            <fieldset className="border-0 p-0 m-0 mt-8">
              <Legend>Branding</Legend>
              <div className="mk-stagger grid @md:grid-cols-3 gap-3">
                {brandingOptions.map((c) => (
                  <TapCard
                    key={c.value}
                    choice={c}
                    type="radio"
                    name="branding"
                    checked={brief.branding === c.value}
                    onChange={() => set("branding", c.value)}
                  />
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {/* STEP 4 - plans, budget, timeline */}
        {step === 3 && (
          <div className="mk-step-in">
            <StepHeading
              title="Plans, budget and timing"
              help="A plan of any kind speeds the 3D design up enormously. Budget stays in bands."
            />

            <fieldset className="border-0 p-0 m-0">
              <Legend>Floor plan</Legend>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  addFiles(e.dataTransfer.files);
                }}
                className={`border border-dashed p-6 text-center transition-colors ${
                  dragging ? "border-accent bg-accent/5" : "border-line bg-smoke"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="mx-auto h-8 w-8 text-ash"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  aria-hidden
                >
                  <path d="M12 16V4m0 0L8 8m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" strokeLinecap="round" />
                </svg>
                <p className="mt-3 text-sm">
                  <span className="font-semibold">Drag a plan in</span>
                  <span className="text-ash"> or </span>
                  {/* A real label-for-input, so this is reachable by keyboard and
                      announced as a file control rather than as a button. */}
                  <label
                    htmlFor="plans"
                    className="underline decoration-accent underline-offset-2 cursor-pointer hover:text-accent-600"
                  >
                    browse your files
                  </label>
                </p>
                <input
                  id="plans"
                  type="file"
                  multiple
                  accept={ACCEPTED_UPLOAD_TYPES}
                  className="sr-only"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <p className="mt-3 text-ash text-xs leading-relaxed max-w-md mx-auto">
                  No official blueprint? A quick phone photo of a hand-drawn sketch with the
                  wall lengths on it works perfectly.
                </p>
                <p className="mt-1.5 font-mono text-[10px] tracking-widest uppercase text-ash/80">
                  PDF or image · up to {MAX_FILES} files · {humanBytes(MAX_FILE_BYTES)} each
                </p>
              </div>

              {fileError && (
                <p className="mt-2 text-accent-600 text-sm" role="alert">
                  {fileError}
                </p>
              )}

              {files.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {files.map((f) => (
                    <li
                      key={`${f.name}-${f.size}`}
                      className="mk-step-in flex items-center justify-between gap-3 border border-line bg-white px-4 py-3"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
                      <span className="font-mono text-[11px] tracking-widest uppercase text-ash shrink-0">
                        {humanBytes(f.size)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setFiles((prev) => prev.filter((p) => p !== f))}
                        className="shrink-0 text-ash hover:text-accent-600 transition-colors"
                        aria-label={`Remove ${f.name}`}
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>

            <fieldset className="border-0 p-0 m-0 mt-8">
              <Legend>Indicative budget</Legend>
              <div className="mk-stagger grid grid-cols-2 @md:grid-cols-3 @xl:grid-cols-5 gap-3">
                {budgetOptions.map((c) => (
                  <TapCard
                    key={c.value}
                    choice={c}
                    type="radio"
                    name="budget"
                    checked={brief.budget === c.value}
                    onChange={() => set("budget", c.value)}
                  />
                ))}
              </div>
            </fieldset>

            <fieldset className="border-0 p-0 m-0 mt-8">
              <Legend>Target completion</Legend>
              <div className="mk-stagger grid grid-cols-2 @md:grid-cols-3 @xl:grid-cols-5 gap-3">
                {timelineOptions.map((c) => (
                  <TapCard
                    key={c.value}
                    choice={c}
                    type="radio"
                    name="timeline"
                    checked={brief.timeline === c.value}
                    onChange={() => set("timeline", c.value)}
                  />
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {/* STEP 5 - contact */}
        {step === 4 && (
          <div className="mk-step-in">
            <StepHeading
              title="Where do we send the design?"
              help="Last step. A real person reads this brief and replies within one business day."
            />
            <div className="space-y-4">
              <div className="grid @md:grid-cols-2 gap-4">
                <input
                  required
                  aria-label="First name"
                  placeholder="First name"
                  autoComplete="given-name"
                  value={brief.firstName}
                  onChange={(e) => set("firstName", e.target.value)}
                  className={fieldClass}
                />
                <input
                  aria-label="Last name"
                  placeholder="Last name"
                  autoComplete="family-name"
                  value={brief.lastName}
                  onChange={(e) => set("lastName", e.target.value)}
                  className={fieldClass}
                />
              </div>
              <div className="grid @md:grid-cols-2 gap-4">
                <input
                  required
                  type="email"
                  aria-label="Email"
                  placeholder="Email"
                  autoComplete="email"
                  value={brief.email}
                  onChange={(e) => set("email", e.target.value)}
                  className={fieldClass}
                />
                <input
                  type="tel"
                  aria-label="Phone"
                  placeholder="Phone"
                  autoComplete="tel"
                  value={brief.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  className={fieldClass}
                />
              </div>
              <div className="grid @md:grid-cols-[1.6fr_1fr] gap-4">
                <input
                  aria-label="Company or gym name"
                  placeholder="Company / gym name"
                  autoComplete="organization"
                  value={brief.company}
                  onChange={(e) => set("company", e.target.value)}
                  className={fieldClass}
                />
                <input
                  aria-label="Postcode"
                  placeholder="Postcode"
                  autoComplete="postal-code"
                  value={brief.postcode}
                  onChange={(e) => set("postcode", e.target.value)}
                  className={fieldClass}
                />
              </div>
              <p className="text-ash text-xs leading-relaxed">
                Postcode is how we cost delivery and installation to your site.
              </p>
              <textarea
                rows={4}
                aria-label="Anything else we should know"
                placeholder="Anything else we should know? (optional)"
                value={brief.message}
                onChange={(e) => set("message", e.target.value)}
                className={fieldClass}
              />
            </div>
          </div>
        )}

        <HoneypotField />
        {error && (
          <p className="mt-5 text-accent-600 text-sm" role="alert">
            {error}
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="border-t border-line px-6 lg:px-8 py-5 flex flex-wrap items-center gap-3">
        {step > 0 && (
          <button type="button" onClick={() => goTo(step - 1)} className="btn btn-out !text-ink">
            <span aria-hidden>←</span> Back
          </button>
        )}
        <div className="flex-1" />
        {/* Steps 2-4 carry an explicit skip, so nobody stalls on a question they
            cannot answer and abandons the form instead. */}
        {step > 0 && step < 4 && (
          <button
            type="button"
            onClick={next}
            className="font-mono text-xs tracking-widest uppercase text-ash hover:text-accent-600 transition-colors"
          >
            Skip
          </button>
        )}
        {step < 4 ? (
          <button
            type="button"
            onClick={next}
            disabled={!stepValid}
            className="btn btn-accent disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continue <span aria-hidden>→</span>
          </button>
        ) : (
          <button
            type="submit"
            disabled={sending || !stepValid}
            className="btn btn-accent disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sending ? "Sending…" : "Get My Free 3D Gym Design"} <span aria-hidden>→</span>
          </button>
        )}
      </div>
    </form>
  );
}
