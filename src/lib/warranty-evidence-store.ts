// Server side of warranty evidence: minting upload URLs and checking what
// actually arrived. SERVER ONLY - it uses the service-role client.
// See lib/warranty-evidence.ts for the why.

import { adminDb } from "@/lib/admin-db";
import {
  EVIDENCE_BUCKET,
  EVIDENCE_LINK_SECONDS,
  evidenceFolder,
  safeName,
  type EvidenceFile,
} from "@/lib/warranty-evidence";

export type UploadSlot = { path: string; signedUrl: string };

/** One signed upload URL per file, all in a fresh folder for this claim. */
export async function createUploadSlots(files: EvidenceFile[]): Promise<UploadSlot[] | null> {
  const db = adminDb();
  if (!db) return null;
  const folder = `claims/${crypto.randomUUID()}`;
  const slots: UploadSlot[] = [];
  for (const [i, f] of files.entries()) {
    const path = `${folder}/${i + 1}-${safeName(f.name)}`;
    const { data, error } = await db.storage.from(EVIDENCE_BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      console.error("[warranty] signed upload url failed", error);
      return null;
    }
    slots.push({ path, signedUrl: data.signedUrl });
  }
  return slots;
}

export type StoredEvidence = { name: string; size: number; type: string; url: string };

/**
 * The evidence for a claim, confirmed present in storage, with signed links for
 * the team. Null when the paths are malformed, storage is unreachable, or any
 * named file never arrived - a claim cannot be lodged on a file that is not there.
 */
export async function confirmEvidence(paths: unknown): Promise<StoredEvidence[] | null> {
  const parsed = evidenceFolder(paths);
  if (!parsed) return null;
  const db = adminDb();
  if (!db) return null;

  const bucket = db.storage.from(EVIDENCE_BUCKET);
  const { data: listed, error } = await bucket.list(parsed.folder, { limit: 100 });
  if (error || !listed) {
    console.error("[warranty] evidence list failed", error);
    return null;
  }

  const out: StoredEvidence[] = [];
  for (const name of parsed.names) {
    const obj = listed.find((o) => o.name === name);
    if (!obj) return null;
    const { data: signed, error: signError } = await bucket.createSignedUrl(
      `${parsed.folder}/${name}`,
      EVIDENCE_LINK_SECONDS
    );
    if (signError || !signed) {
      console.error("[warranty] evidence sign failed", signError);
      return null;
    }
    const meta = (obj.metadata ?? {}) as { size?: number; mimetype?: string };
    out.push({ name, size: Number(meta.size ?? 0), type: String(meta.mimetype ?? ""), url: signed.signedUrl });
  }
  return out;
}
