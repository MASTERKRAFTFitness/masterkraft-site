"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ADMIN_COOKIE, adminSecret, readSession } from "@/lib/admin-auth";
import { actorFrom } from "@/lib/agent/audit";
import { clearMatrixCache } from "@/lib/freight-matrix";
import { parseLevy, setFuelLevy } from "@/lib/fuel-levy";

export type LevyFormState = { ok: boolean; message: string } | null;

/**
 * Set a rate card's fuel levy from /admin/freight.
 *
 * RE-CHECKS THE SESSION ITSELF. A Server Action is a POST endpoint anyone can
 * call; the proxy gate in front of /admin is the optimistic check, not the only
 * one. Same rule every /api/admin route follows.
 */
export async function updateFuelLevy(_prev: LevyFormState, formData: FormData): Promise<LevyFormState> {
  const secret = adminSecret();
  const session = secret ? await readSession((await cookies()).get(ADMIN_COOKIE)?.value, secret) : null;
  if (!session) return { ok: false, message: "Your session has expired. Sign in again." };

  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { ok: false, message: "No rate card was chosen." };

  const parsed = parseLevy(formData.get("percent"));
  if (!parsed.ok) return { ok: false, message: parsed.error };

  const note = String(formData.get("note") ?? "");
  const result = await setFuelLevy(code, parsed.value, actorFrom(session), note);
  if (!result.ok) return { ok: false, message: result.error };

  // This instance quotes on the new levy straight away; every other instance
  // within FREIGHT_MATRIX_TTL_SECONDS (a minute by default).
  clearMatrixCache();
  revalidatePath("/admin/freight");

  const changed =
    result.oldPercent === result.newPercent
      ? `Levy confirmed at ${result.newPercent}%, unchanged.`
      : `Levy changed from ${result.oldPercent}% to ${result.newPercent}%. Checkout uses it within a minute.`;
  return {
    ok: true,
    message: result.recorded ? changed : `${changed} The change history could not be written, so this one is not in the log below.`,
  };
}
