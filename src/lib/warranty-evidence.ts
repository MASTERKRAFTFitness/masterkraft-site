// Photos and videos attached to a warranty claim.
//
// WHY THEY DO NOT RIDE IN THE CLAIM REQUEST: a phone video is tens of megabytes
// and a Vercel function refuses any request body over 4.5 MB. So the browser
// asks /api/warranty-claim/upload for signed upload URLs, PUTs each file straight
// into the private `warranty-evidence` Supabase bucket, and then sends the claim
// with only the storage paths. The claim route checks those paths really exist
// before it accepts the claim: a photo or video is mandatory.
//
// The bucket is private with no RLS policies, so only the service role can read
// or list it. The team gets long-lived signed links in the claim email.
//
// The limits are shared with the form so the browser refuses what the server
// would, before anything is uploaded. 50 MB matches the bucket's own
// file_size_limit (and the Supabase plan's per-file ceiling).

export const EVIDENCE_BUCKET = "warranty-evidence";
export const MAX_EVIDENCE_FILES = 5;
export const MAX_EVIDENCE_BYTES = 50 * 1024 * 1024;
export const EVIDENCE_ACCEPT = "image/*,video/*";

/** How long the links in the team's email keep working: a year covers a slow claim. */
export const EVIDENCE_LINK_SECONDS = 365 * 24 * 60 * 60;

export type EvidenceFile = { name: string; type: string; size: number };

export function isEvidenceType(type: string): boolean {
  return /^(image|video)\/[\w.+-]+$/i.test(type);
}

/** Why a set of files cannot be attached, or null if it can. Same wording on both sides. */
export function evidenceProblem(files: EvidenceFile[]): string | null {
  if (files.length === 0) return "Please add at least one photo or video of the fault.";
  if (files.length > MAX_EVIDENCE_FILES) return `Please attach no more than ${MAX_EVIDENCE_FILES} files.`;
  for (const f of files) {
    if (!isEvidenceType(f.type)) return `${f.name} is not a photo or video.`;
    if (f.size > MAX_EVIDENCE_BYTES) return `${f.name} is over the 50 MB limit. Try a shorter clip.`;
    if (f.size <= 0) return `${f.name} is empty.`;
  }
  return null;
}

/** A storage-safe file name: keeps the extension, drops anything odd. */
export function safeName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(-80);
  return cleaned || "file";
}

// claims/<uuid>/<n>-<name>. The uuid is minted by the server per claim, so one
// claim can only ever point inside its own folder.
const PATH_RE = /^claims\/([0-9a-f-]{36})\/(\d-[\w.-]+)$/;

/**
 * The claim's folder if every path is well formed and shares one folder, else
 * null. Pure, so the shape check needs no storage round trip.
 */
export function evidenceFolder(paths: unknown): { folder: string; names: string[] } | null {
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > MAX_EVIDENCE_FILES) return null;
  let folder: string | null = null;
  const names: string[] = [];
  for (const p of paths) {
    const m = typeof p === "string" ? PATH_RE.exec(p) : null;
    if (!m) return null;
    if (folder && folder !== m[1]) return null;
    folder = m[1];
    names.push(m[2]);
  }
  return folder ? { folder: `claims/${folder}`, names } : null;
}

export function humanBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
