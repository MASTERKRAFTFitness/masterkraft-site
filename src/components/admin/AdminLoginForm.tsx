"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const fieldClass =
  "w-full px-4 py-3 border border-line bg-white text-ink placeholder:text-ash/70 focus:outline-none focus:border-accent transition-colors";

export default function AdminLoginForm({ mode }: { mode: "supabase" | "shared" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [stage, setStage] = useState<"identify" | "code">("identify");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function done() {
    const next = params.get("next");
    router.replace(next && next.startsWith("/admin") ? next : "/admin");
    router.refresh();
  }

  async function post(payload: Record<string, string>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; stage?: string };
      if (!res.ok) {
        setError(data.error ?? "Sign in failed.");
        return;
      }
      if (data.stage === "code_sent") setStage("code");
      else done();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "shared") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void post({ password });
        }}
        className="mt-8 space-y-3"
      >
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-label="Password"
          placeholder="Password"
          autoComplete="current-password"
          autoFocus
          required
          className={fieldClass}
        />
        <button type="submit" disabled={busy || !password} className="btn btn-accent w-full disabled:opacity-50">
          {busy ? "Checking..." : "Sign in"}
        </button>
        {error && <p role="alert" className="text-sm text-accent">{error}</p>}
        <p className="text-xs text-ash pt-2">
          Shared password mode. Actions cannot be attributed to a person until the database is
          configured.
        </p>
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void post(stage === "identify" ? { email } : { email, code });
      }}
      className="mt-8 space-y-3"
    >
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-label="Work email"
        placeholder="you@masterkraft.com"
        autoComplete="email"
        autoFocus
        required
        readOnly={stage === "code"}
        className={`${fieldClass} ${stage === "code" ? "bg-smoke text-ash" : ""}`}
      />

      {stage === "code" && (
        <>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            aria-label="Six digit code"
            placeholder="6 digit code"
            autoComplete="one-time-code"
            autoFocus
            required
            className={`${fieldClass} font-mono tracking-[0.35em] text-center`}
          />
          <p className="text-xs text-ash">
            Sent to {email}. It expires in 10 minutes.{" "}
            <button
              type="button"
              onClick={() => {
                setCode("");
                setStage("identify");
              }}
              className="underline underline-offset-2 hover:text-ink"
            >
              Use a different address
            </button>
          </p>
        </>
      )}

      <button
        type="submit"
        disabled={busy || (stage === "identify" ? !email : code.length < 6)}
        className="btn btn-accent w-full disabled:opacity-50"
      >
        {busy ? "Working..." : stage === "identify" ? "Email me a code" : "Sign in"}
      </button>

      {error && <p role="alert" className="text-sm text-accent">{error}</p>}
    </form>
  );
}
