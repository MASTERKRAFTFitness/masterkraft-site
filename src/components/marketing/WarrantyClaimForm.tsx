"use client";

import { useState } from "react";
import { HoneypotField, guardValues, useFillTimer } from "@/components/forms/guard";
import {
  EVIDENCE_ACCEPT,
  MAX_EVIDENCE_FILES,
  evidenceProblem,
  humanBytes,
} from "@/lib/warranty-evidence";

// Matches ContactForm's field styling so the two read as one system.
const fieldClass =
  "w-full px-4 py-3 border border-line bg-white text-ink placeholder:text-ash/70 focus:outline-none focus:border-accent transition-colors";

export default function WarrantyClaimForm() {
  const elapsed = useFillTimer();
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      if (!next.some((f) => f.name === file.name && f.size === file.size)) next.push(file);
    }
    const problem = evidenceProblem(next.map((f) => ({ name: f.name, type: f.type, size: f.size })));
    if (problem) {
      setFileError(problem);
      return;
    }
    setFileError(null);
    setFiles(next);
  }

  // Straight to storage, one file at a time, so a big video never passes through
  // our server. Returns the storage paths the claim route will check.
  async function uploadEvidence(): Promise<string[]> {
    const res = await fetch("/api/warranty-claim/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })) }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Your files could not be uploaded.");
    const slots = data.slots as { path: string; signedUrl: string }[];
    for (const [i, slot] of slots.entries()) {
      setProgress(`Uploading ${i + 1} of ${slots.length}…`);
      const part = new FormData();
      part.append("cacheControl", "3600");
      part.append("", files[i]);
      const up = await fetch(slot.signedUrl, { method: "PUT", body: part, headers: { "x-upsert": "false" } });
      if (!up.ok) throw new Error(`${files[i].name} did not upload. Please try again.`);
    }
    return slots.map((s) => s.path);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const problem = evidenceProblem(files.map((f) => ({ name: f.name, type: f.type, size: f.size })));
    if (problem) {
      setFileError(problem);
      document.getElementById("wc-evidence-drop")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSending(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      const evidence = await uploadEvidence();
      setProgress("Lodging claim…");
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
          evidence,
          ...guardValues(f, elapsed()),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Something went wrong.");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSending(false);
      setProgress(null);
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

      <fieldset className="border-0 p-0 m-0">
        <legend className="mb-2 text-sm font-semibold">
          Photos or video of the fault <span className="text-accent-600">*</span>
        </legend>
        <div
          id="wc-evidence-drop"
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
            dragging ? "border-accent bg-accent/5" : fileError ? "border-accent-600 bg-smoke" : "border-line bg-smoke"
          }`}
        >
          <p className="text-sm">
            <span className="font-semibold">Drag photos or a video in</span>
            <span className="text-ash"> or </span>
            <label
              htmlFor="wc-evidence"
              className="underline decoration-accent underline-offset-2 cursor-pointer hover:text-accent-600"
            >
              choose files
            </label>
          </p>
          <input
            id="wc-evidence"
            type="file"
            multiple
            accept={EVIDENCE_ACCEPT}
            className="sr-only"
            aria-required="true"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <p className="mt-2 text-ash text-xs leading-relaxed max-w-md mx-auto">
            Required. Show the fault clearly; a short video of it happening is ideal.
          </p>
          <p className="mt-1.5 font-mono text-[10px] tracking-widest uppercase text-ash/80">
            Photo or video · up to {MAX_EVIDENCE_FILES} files · 50 MB each
          </p>
        </div>

        {fileError && (
          <p className="mt-2 text-accent-600 text-sm" role="alert">
            {fileError}
          </p>
        )}

        {files.length > 0 && (
          <ul className="mt-3 space-y-2">
            {files.map((file) => (
              <li
                key={`${file.name}-${file.size}`}
                className="flex items-center justify-between gap-3 border border-line bg-white px-4 py-3"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                <span className="font-mono text-[11px] tracking-widest uppercase text-ash shrink-0">
                  {humanBytes(file.size)}
                </span>
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => setFiles((prev) => prev.filter((p) => p !== file))}
                  className="shrink-0 text-ash hover:text-accent-600 transition-colors"
                  aria-label={`Remove ${file.name}`}
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

      <HoneypotField />
      {error && <p className="text-accent-600 text-sm">{error}</p>}
      <button type="submit" disabled={sending} className="btn btn-accent w-full sm:w-auto disabled:opacity-60">
        {sending ? progress ?? "Sending…" : "Lodge Warranty Claim"} <span aria-hidden>→</span>
      </button>
    </form>
  );
}
