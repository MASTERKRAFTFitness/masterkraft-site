// Photographs the ERP is missing for RANGE SIZES, recovered and staged for upload.
//
//   npm run report:photoupload
//     reports/erp-photo-upload.md   what was found, and what could not be
//     reports/erp-upload-images/    the files, named by Unleashed ProductCode
//
// WHY THIS IS A STAGING STEP AND NOT AN UPLOAD. The Unleashed API cannot write
// images: `Images` appears in the GET Products response and in no POST request
// field, and Unleashed's own support notes images cannot even be bulk-loaded by
// CSV — they are added on the product record or through the File Library, in the
// UI, by hand. So this does every part a machine can do (work out WHICH code is
// missing a photograph, find the right photograph, fetch it, name it after the
// code) and leaves the drag-and-drop.
//
// WHERE THE PICTURES COME FROM. Not masterkraft.com: every /wp-content/uploads/
// path 404s since the cutover, and 208 of the references here are that. The
// catalogues app kept a full mirror of the WordPress uploads at
// catalogues.masterkraft.com/woo-images/<year>/<month>/<file>, same layout, and
// that is the only surviving copy of the S-prefixed photography.
//
// Read-only against Unleashed. It writes files here and changes nothing there.
import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { it } from "vitest";

const env = new Map<string, string>();
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env.set(m[1], m[2].replace(/^["']|["']$/g, ""));
}
for (const [k, v] of env) if (!process.env[k]) process.env[k] = v;

const { allProducts, variationsFor } = await import("@/lib/catalogue");
const { skuAliases } = await import("@/lib/unleashed-aliases");
const { isRetiredSku } = await import("@/lib/obsolete");
const { getRange } = await import("@/lib/ranges");
const imageOverrides = (await import("@/lib/product-image-overrides.json")).default as Record<string, string[]>;
type UnleashedMap = Awaited<ReturnType<typeof import("@/lib/unleashed").getUnleashedMap>>;
type WcProduct = Parameters<typeof getRange>[0];
type RangeSize = NonNullable<ReturnType<typeof getRange>>["sizes"][number];

const MIRROR = "https://catalogues.masterkraft.com/woo-images";
const OUTDIR = "reports/erp-upload-images";
const OUT = "reports/erp-photo-upload.md";

const sign = (q: string) =>
  createHmac("sha256", process.env.UNLEASHED_API_KEY ?? "").update(q).digest("base64");

type ErpProduct = { ProductCode?: string; ProductDescription?: string; ImageUrl?: string;
  Images?: { Url?: string; IsDefault?: boolean }[]; IsSellable?: boolean };

async function allErp(): Promise<ErpProduct[]> {
  const items: ErpProduct[] = [];
  for (let page = 1; page <= 20; page++) {
    const q = "pageSize=200";
    const res = await fetch(`https://api.unleashedsoftware.com/Products/${page}?${q}`, {
      headers: { "api-auth-id": process.env.UNLEASHED_API_ID ?? "",
        "api-auth-signature": sign(q), Accept: "application/json" } });
    if (!res.ok) throw new Error(`Unleashed /Products/${page}: ${res.status}`);
    const j = (await res.json()) as { Items?: ErpProduct[]; Pagination?: { NumberOfPages?: number } };
    items.push(...(j.Items ?? []));
    if (page >= (j.Pagination?.NumberOfPages ?? 1)) break;
  }
  return items;
}

/** A wp-content URL, re-pointed at the surviving mirror. Local paths pass through. */
const toMirror = (src: string) =>
  src.includes("/wp-content/uploads/")
    ? `${MIRROR}/${src.split("/wp-content/uploads/")[1].split("?")[0]}`
    : src;

const L: string[] = [];
const say = (s = "") => L.push(s);

it("stages the ERP's missing size photographs", async () => {
  const erp = await allErp();
  const map: UnleashedMap = {};
  const hasImage = new Set<string>();
  const known = new Set<string>();
  const erpName = new Map<string, string>();
  for (const p of erp) {
    const code = (p.ProductCode ?? "").trim().toUpperCase();
    if (!code) continue;
    known.add(code);
    erpName.set(code, (p.ProductDescription ?? "").trim());
    const img = p.Images?.find((i) => i.IsDefault)?.Url ?? p.Images?.[0]?.Url ?? p.ImageUrl;
    if (img) hasImage.add(code);
    map[code] = { price: 0, stock: 0, name: p.ProductDescription?.trim() || undefined,
      image: img || undefined, sellable: p.IsSellable !== false };
  }
  const resolve = (c?: string) => {
    const up = (c ?? "").trim().toUpperCase();
    return known.has(up) ? up : (skuAliases[up] && known.has(skuAliases[up]) ? skuAliases[up] : "");
  };

  type Row = { code: string; name: string; size: string; parent: string; src: string; file?: string; note?: string };
  const found: Row[] = [], missing: Row[] = [];
  const seen = new Set<string>();

  for (const raw of allProducts() as WcProduct[]) {
    if (isRetiredSku(raw.sku)) continue;
    const range = getRange(raw, map);
    if (!range) continue;
    // Only the sizes with NO photograph in the ERP — the rest are done.
    const gaps = range.sizes.filter((s: RangeSize) => { const c = resolve(s.code); return c && !hasImage.has(c); });
    if (!gaps.length) continue;

    const vars = variationsFor(raw.id) ?? [];
    const parentImgs: string[] = imageOverrides[(raw.sku ?? "").trim()]?.length
      ? imageOverrides[(raw.sku ?? "").trim()]
      : (raw.images ?? []).map((i) => i.src);

    for (const s of gaps) {
      const code = resolve(s.code);
      if (!code || seen.has(code)) continue;
      seen.add(code);
      // The variation whose SKU IS this ERP code carries the photograph of THIS
      // size. Falling back to the parent's shot would put one picture on every
      // size in the range, which is what the swap just stopped doing.
      const v = vars.find((x) => resolve(x.sku) === code);
      const src = v?.image?.src ?? (range.sizes.length === 1 ? parentImgs[0] : undefined);
      const row: Row = { code, name: erpName.get(code) ?? s.label, size: s.label, parent: raw.sku ?? "", src: src ?? "" };
      if (!src) { row.note = "no per-size photograph in the snapshot"; missing.push(row); continue; }
      found.push(row);
    }
  }

  // ONE PHOTOGRAPH, ONE SIZE. A source used by two codes means the snapshot's
  // variation data is wrong, not that two sizes look alike: SWWPOU01 (1.5kg)
  // points at SWWPOU02-1S.jpg, the 2.5kg plate's shot. Uploading that would put
  // the wrong weight on a product page — worse than the blank this is meant to
  // fill, and precisely the per-size inaccuracy the ERP swap exists to end. The
  // code whose OWN name is in the filename keeps it; the other is quarantined.
  const bySource = new Map<string, Row[]>();
  for (const r of found) bySource.set(r.src, [...(bySource.get(r.src) ?? []), r]);
  const contested: Row[] = [];
  for (const [src, rows] of bySource) {
    if (rows.length < 2) continue;
    const file = src.split("/").pop() ?? "";
    for (const r of rows) {
      if (file.toUpperCase().includes(r.code.toUpperCase())) continue;
      r.note = `shares ${file} with ${rows.filter((o) => o !== r).map((o) => o.code).join(", ")} — the snapshot points this size at another size's photograph`;
      contested.push(r);
    }
  }
  const staged = found.filter((r) => !contested.includes(r));
  missing.push(...contested);

  // A weaker signal, reported rather than acted on: the filename does not carry
  // this code. Legitimate for the S-prefixed twins, whose WooCommerce pages
  // reuse the MasterKraft photograph of the same physical item.
  const oddName = staged.filter((r) => {
    const f = (r.src.split("/").pop() ?? "").toUpperCase();
    return !f.includes(r.code.toUpperCase());
  });

  mkdirSync(OUTDIR, { recursive: true });
  let ok = 0, failed = 0;
  for (const r of staged) {
    const local = r.src.startsWith("/") ? `public${r.src.split("?")[0]}` : "";
    const ext = (r.src.split("?")[0].match(/\.(jpe?g|png|webp)$/i)?.[1] ?? "jpg").toLowerCase();
    const file = `${OUTDIR}/${r.code}.${ext === "jpeg" ? "jpg" : ext}`;
    if (local && existsSync(local)) { copyFileSync(local, file); r.file = file; ok++; continue; }
    try {
      const res = await fetch(toMirror(r.src));
      if (!res.ok) throw new Error(String(res.status));
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      r.file = file; ok++;
    } catch (e) { r.note = `fetch failed (${e})`; failed++; missing.push(r); }
  }

  say(`# Photographs Unleashed is missing, staged for upload`);
  say(``);
  say(`Generated by \`npm run report:photoupload\`. Read-only against Unleashed.`);
  say(``);
  say(`**The API cannot upload these.** \`Images\` is a GET-only field on Products —`);
  say(`it appears in no POST request body — and Unleashed's support notes images`);
  say(`cannot be bulk-loaded by CSV either. They go on the product record or into`);
  say(`the File Library by hand. Everything a machine can do is done here: the`);
  say(`files below are named after the ProductCode they belong to.`);
  say(``);
  say(`| | |`);
  say(`|---|---:|`);
  say(`| Size codes with no photograph in the ERP | **${found.length + missing.length}** |`);
  say(`| Photograph recovered and staged | **${ok}** |`);
  say(`| Quarantined — points at another size's photograph | ${contested.length} |`);
  say(`| No photograph in the snapshot at all | ${missing.length - contested.length} |`);
  say(``);
  say(`Files: \`${OUTDIR}/<ProductCode>.jpg\` — gitignored (matches \`reports/*-images/\`).`);
  say(``);
  say(`## Staged — upload these`);
  say(``);
  say(`| ProductCode | Product | Size | File |`);
  say(`|---|---|---|---|`);
  for (const r of staged.filter((r) => r.file).sort((a, b) => a.code.localeCompare(b.code)))
    say(`| \`${r.code}\` | ${r.name} | ${r.size} | \`${r.file?.split("/").pop()}\` |`);
  if (missing.length) {
    say(``);
    say(`## Not recoverable`);
    say(``);
    say(`| ProductCode | Product | Size | Why |`);
    say(`|---|---|---|---|`);
    for (const r of missing.sort((a, b) => a.code.localeCompare(b.code)))
      say(`| \`${r.code}\` | ${r.name} | ${r.size} | ${r.note} |`);
  }
  if (oddName.length) {
    say(``);
    say(`## Staged, but worth a glance`);
    say(``);
    say(`The filename does not carry the code. Expected for the S-prefixed twins,`);
    say(`whose pages reuse the MasterKraft photograph of the same physical item.`);
    say(``);
    say(`| ProductCode | Product | Source file |`);
    say(`|---|---|---|`);
    for (const r of oddName.sort((a, b) => a.code.localeCompare(b.code)))
      say(`| \`${r.code}\` | ${r.name} | \`${r.src.split("/").pop()}\` |`);
  }
  writeFileSync(OUT, L.join("\n") + "\n");
  writeFileSync(`${OUTDIR}/manifest.csv`,
    "erp_product_code,product,size,file,source\n" +
    staged.filter((r) => r.file).map((r) =>
      `"${r.code}","${r.name.replace(/"/g,'""')}","${r.size.replace(/"/g,'""')}","${r.file?.split("/").pop()}","${toMirror(r.src)}"`
    ).join("\n") + "\n");
  console.log(`staged ${ok}, failed ${failed}, no source ${missing.length - failed}`);
}, 600_000);
