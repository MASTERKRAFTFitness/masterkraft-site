"use client";

import { useActionState } from "react";
import { updateFuelLevy, type LevyFormState } from "@/app/admin/freight/actions";

// Same field treatment as AdminLoginForm, so the console reads as one thing.
const fieldClass =
  "px-4 py-3 border border-line bg-white text-ink placeholder:text-ash/70 focus:outline-none focus:border-accent transition-colors";

export default function FuelLevyForm({ code, current }: { code: string; current: number }) {
  const [state, action, pending] = useActionState<LevyFormState, FormData>(updateFuelLevy, null);

  return (
    <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
      <input type="hidden" name="code" value={code} />
      <label className="flex flex-col gap-1 text-xs text-ash">
        New levy (%)
        <input
          name="percent"
          inputMode="decimal"
          defaultValue={String(current)}
          required
          className={`${fieldClass} w-32 font-mono`}
        />
      </label>
      <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs text-ash">
        Note (optional)
        <input name="note" maxLength={500} placeholder="e.g. FAF letter 13 Oct" className={fieldClass} />
      </label>
      <button type="submit" disabled={pending} className="btn btn-accent disabled:opacity-50">
        {pending ? "Saving…" : "Save levy"}
      </button>
      {state && (
        <p role={state.ok ? "status" : "alert"} className={`basis-full text-sm ${state.ok ? "text-ink" : "text-accent-600"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
