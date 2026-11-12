// A layout as a shareable URL fragment: "#l=" + base64url(JSON).
//
// The fragment never reaches the server, so a shared layout needs no storage and
// no account, and nothing a visitor plans is logged. Products are referenced by
// slug, which is what the product pages are keyed by; a slug the catalogue no
// longer has is dropped on load rather than drawn as a guess.

export type PlacedItem = { id: string; slug: string; x: number; z: number; rot: number };
export type Layout = { room: { w: number; d: number }; items: PlacedItem[] };

type Wire = { r: [number, number]; i: [string, number, number, number][] };

const round = (n: number) => Math.round(n * 100) / 100;

export function encodeLayout(layout: Layout): string {
  const wire: Wire = {
    r: [round(layout.room.w), round(layout.room.d)],
    i: layout.items.map((it) => [it.slug, round(it.x), round(it.z), Math.round(it.rot)]),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(wire));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** The layout in a fragment, or null when there is none or it does not parse. */
export function decodeLayout(code: string, knownSlugs: Set<string>): Layout | null {
  try {
    const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
    const wire = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as Wire;
    if (!Array.isArray(wire?.r) || !Array.isArray(wire?.i)) return null;
    const room = { w: clamp(Number(wire.r[0]) || 12, 3, 60), d: clamp(Number(wire.r[1]) || 10, 3, 60) };
    const items: PlacedItem[] = wire.i
      .filter((row) => Array.isArray(row) && knownSlugs.has(String(row[0])))
      .slice(0, 200)
      .map((row, n) => ({
        id: `s${n}`,
        slug: String(row[0]),
        x: clamp(Number(row[1]) || 0, 0, room.w),
        z: clamp(Number(row[2]) || 0, 0, room.d),
        rot: ((Number(row[3]) || 0) % 360 + 360) % 360,
      }));
    return { room, items };
  } catch {
    return null;
  }
}
