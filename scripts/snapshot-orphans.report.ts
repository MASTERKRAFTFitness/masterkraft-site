// What the site still shows that the ERP has never heard of.
//
//   reports/snapshot-orphans.csv        every orphan, with why it is or is not live
//   reports/snapshot-orphans.md         the short list somebody has to act on
//
// Run:  npm run report:orphans
//
// WHY. The catalogue comes from Unleashed now, but the frozen WooCommerce
// snapshot is still what supplies the words, the photographs and the URL each
// page lives at. So a product can exist in the snapshot, render a complete page
// with a picture and a price, and have no record in inventory at all. Nothing
// in either system notices: the ERP cannot miss what it never had, and the site
// has no reason to ask.
//
// AN ORPHAN IS "THE ERP HAS NEVER HEARD OF THIS", not "the ERP discontinued
// it". The check is against EVERY product code Unleashed holds, obsolete and
// unsellable included — a retired product is a known product, and the ERP-retired
// list already handles those.
//
// IT RESOLVES THROUGH THE ALIAS MAP, and the first version of this report did
// not, which is exactly the mistake this file's neighbours warn about. The two
// systems do not always share a code: the Concept2 range is SCRWAR04 in
// WooCommerce and C2ROWERG in Unleashed, and lib/unleashed-aliases holds that
// mapping by hand. Comparing raw codes reported all three ergs as products the
// ERP had never heard of — they are in it, under the other scheme. Use the same
// resolution lookupBySku uses, or the report invents work.
//
// MOST ORPHANS ARE HARMLESS and the report says so rather than listing all 127
// rows as if they were all work:
//
//   CONTAINERS ARE CORRECT. MMDBRH-GROUP and its kind exist only to group sizes.
//   The ERP holds the individual ones — MMDBRH01, MMDBRH12 — and erpUnits()
//   collapses them into one card at render time. The ERP not knowing the
//   container is the design working, not a gap.
//
//   A CONTAINER IS NOT ONLY A `-GROUP` CODE, and testing the suffix alone is the
//   bug this report shipped with. 70 of the 126 containers are bare `variable`
//   products carrying no suffix at all — AMDBRH, MWBBFUR, AWWPOU — whose sizes
//   the ERP holds as AMDBRH01, MWBBFUR01, AWWPOU01. Eight of those were live on
//   the site, so billing them as work put 9 rows on the list somebody has to act
//   on when only one of them was real. Test the
//   STRUCTURE (does this record exist to hold variations?) and then ask whether
//   the ERP holds what it stands for.
//
//   HIDDEN AND RETIRED ONES DO NOT RENDER. They are snapshot residue.
//
//   PORTAL BRANDS DO NOT RENDER on masterkraft.com either, since the public
//   site is an allowlist — see lib/woocommerce.
//
// WHAT IS LEFT after those is the short list at the top of the .md, and it is an
// inventory question rather than an engineering one: is this stock actually in
// the warehouse? If it is, it needs an ERP record. If it is not, the page should
// go. Today the site offers it either way, photographed and priced, and nothing
// in inventory can confirm a single one.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { it } from "vitest";
import { allProducts } from "@/lib/catalogue";
import { anchorCodes } from "@/lib/ranges";
import { isObsolete, isPublicSiteSku, isPortalOnlyBrand, type WcProduct } from "@/lib/woocommerce";
import { skuAliases } from "@/lib/unleashed-aliases";

const CSV = "reports/snapshot-orphans.csv";
const MD = "reports/snapshot-orphans.md";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, ""),
    ])
);

type RawProduct = { ProductCode?: string };

async function productsPage(n: number) {
  // includeObsolete=true IS LOAD-BEARING. GET /Products hides obsolete records
  // by default: without it Unleashed returns 1,484 products, every one saying
  // Obsolete:false, which reads convincingly as "this company never retires
  // anything". With it, 2,364, of which 880 are obsolete. This report claims to
  // check against EVERY code the ERP holds, obsolete included, and shipped for
  // a month not doing it — so 19 products the ERP had merely RETIRED were
  // reported as ones it had never heard of. Same trap, same wording, as
  // scripts/build-obsolete-skus.mjs. The field is `Obsolete`, not `IsObsolete`.
  const q = "pageSize=200&includeObsolete=true";
  const res = await fetch(`https://api.unleashedsoftware.com/Products/${n}?${q}`, {
    headers: {
      "api-auth-id": env.UNLEASHED_API_ID,
      "api-auth-signature": crypto.createHmac("sha256", env.UNLEASHED_API_KEY).update(q).digest("base64"),
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
    },
  });
  if (!res.ok) throw new Error(`Unleashed ${res.status} on Products/${n}`);
  return res.json() as Promise<{ Items: RawProduct[]; Pagination?: { NumberOfPages?: number } }>;
}

const csvCell = (v: string | number | boolean) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: (string | number | boolean)[][]) =>
  rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";

const overrides = JSON.parse(
  readFileSync("src/lib/product-image-overrides.json", "utf8")
) as Record<string, string[]>;
const overrideByCode = new Map(
  Object.entries(overrides).map(([k, v]) => [k.trim().toUpperCase(), v])
);

/** Does this product actually render a photograph, or a broken image? */
function imageResolves(code: string, p: WcProduct): boolean {
  const ov = overrideByCode.get(code);
  if (ov?.length) return ov.every((path) => existsSync(`public${path}`));
  const src = p.images?.[0]?.src ?? "";
  return src.startsWith("/") ? existsSync(`public${src}`) : false;
}

it("snapshot orphans", { timeout: 300_000 }, async () => {
  let erp: RawProduct[] = [];
  for (let page = 1; ; page++) {
    const j = await productsPage(page);
    erp = erp.concat(j.Items ?? []);
    if (!j.Pagination?.NumberOfPages || page >= j.Pagination.NumberOfPages) break;
  }
  // EVERY code, sellable or not. See the note above.
  const known = new Set(erp.filter((p) => p.ProductCode).map((p) => p.ProductCode!.toUpperCase()));
  // A short read means includeObsolete quietly stopped applying, and every
  // retired product would be reported as an orphan. Fail rather than publish it.
  if (known.size < 1500) {
    throw new Error(
      `Only ${known.size} ERP codes came back, expected ~1,900 with obsolete ` +
        `records included — includeObsolete did not apply. Refusing to write.`
    );
  }

  /** Direct match first, then the alias — the order lookupBySku uses. */
  const resolves = (code: string) => {
    const alias = skuAliases[code]?.toUpperCase();
    return known.has(code) || (!!alias && known.has(alias));
  };

  /**
   * Does the ERP hold a `<stem><digits>` code — that is, does it know this
   * FAMILY, whatever WooCommerce calls the container standing in front of it?
   *
   * The fallback for when anchor codes cannot answer, which happens two ways:
   * AMKBUR-GROUP has no variations in the snapshot at all, and MFRFRR-GROUP's
   * four are on a code scheme the ERP has retired. Both look like the ERP has
   * never heard of the product, and both are wrong — it carries AMKBUR01-06 and
   * MFRFRR01/03/06. What is stale there is WooCommerce's own bookkeeping, which
   * is a different report's problem.
   *
   * USED ONLY TO ASK "DOES THE ERP KNOW THIS FAMILY", never to build a range's
   * member list. lib/ranges is explicit that the stem is the wrong key for that
   * — MWBBFUR holds three unrelated barbells — and it remains wrong for it.
   */
  const stemKnown = (stem: string) => {
    const re = new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\d+$`);
    for (const c of known) if (re.test(c)) return true;
    return false;
  };

  type Row = {
    code: string;
    name: string;
    slug: string;
    channel: "public" | "clearance" | "portal";
    /** A WooCommerce record that exists only to group sizes. */
    container: boolean;
    /** A container whose sizes the ERP does hold: harmless, not work. */
    covered: boolean;
    obsolete: boolean;
    renders: boolean;
    servable: boolean;
  };

  const rows: Row[] = [];
  for (const p of allProducts() as WcProduct[]) {
    const code = (p.sku ?? "").trim().toUpperCase();
    if (!code) continue;
    if (resolves(code)) continue;
    const obsolete = isObsolete(p);
    const channel = isPortalOnlyBrand(code)
      ? ("portal" as const)
      : code.startsWith("A")
        ? ("clearance" as const)
        : ("public" as const);
    // STRUCTURE FIRST: a `-GROUP` suffix or a bare `variable` product holding
    // variations. Both exist only to group sizes; the suffix is one spelling of
    // the same thing, not the definition. See the note at the top of the file.
    const anchors = anchorCodes(p);
    const container = /-GROUP$/i.test(code) || anchors.length > 0;
    // Mirrors lib/ranges' private stemOf: `-GROUP` and `-1` are bundle suffixes.
    const stem = code.replace(/-(?:GROUP|1)$/i, "");
    rows.push({
      code,
      name: p.name,
      slug: p.slug,
      channel,
      container,
      covered: container && (anchors.some(resolves) || stemKnown(stem)),
      obsolete,
      renders: imageResolves(code, p),
      servable: !obsolete && isPublicSiteSku(code),
    });
  }

  // The list somebody has to do something about: live on the site, and not a
  // container the ERP is right not to have.
  const actionable = rows
    .filter((r) => r.servable && !r.container)
    .sort((a, b) => a.code.localeCompare(b.code));

  // A container is only harmless while the ERP holds what it stands for. One
  // that is live on the site and backed by nothing at all is a different gap,
  // and a real one — the page offers a size picker over stock no system has.
  const stranded = rows
    .filter((r) => r.servable && r.container && !r.covered)
    .sort((a, b) => a.code.localeCompare(b.code));

  mkdirSync("reports", { recursive: true });
  writeFileSync(
    CSV,
    csv([
      ["SKU", "Name", "Slug", "Channel", "Size container", "ERP holds the sizes", "Obsolete", "Image renders", "Servable on site"],
      ...rows
        .sort((a, b) => Number(b.servable) - Number(a.servable) || a.code.localeCompare(b.code))
        .map((r) => [r.code, r.name, r.slug, r.channel, r.container, r.covered, r.obsolete, r.renders, r.servable]),
    ])
  );

  const count = (f: (r: Row) => boolean) => rows.filter(f).length;
  const byChannel = (c: Row["channel"]) => actionable.filter((r) => r.channel === c);

  const md = [
    "# Products the site shows and the ERP has never heard of",
    "",
    `Generated ${new Date().toISOString().slice(0, 10)} · \`npm run report:orphans\``,
    "",
    `${rows.length} snapshot products have no record in Unleashed — checked against every`,
    "code it holds, obsolete included.",
    "",
    "| | count |",
    "|---|---:|",
    `| **Needs a decision** | ${actionable.length} |`,
    `| **Live size pickers over stock nobody holds** | ${stranded.length} |`,
    `| Size containers — correct, the ERP holds the sizes | ${count((r) => r.covered)} |`,
    `| Obsolete or hidden — do not render | ${count((r) => r.obsolete)} |`,
    `| Portal brands — not listed on the public site | ${count((r) => r.channel === "portal")} |`,
    "",
    "## The list",
    "",
    ...(actionable.length
      ? [
          "Live on masterkraft.com, photographed, priced, and invisible to inventory.",
          "**Is this stock actually in the warehouse?** If it is, it needs an ERP record.",
          "If it is not, the page should go.",
          "",
        ]
      : [
          "**Nothing.** Every product the site serves resolves to an Unleashed record —",
          "directly, through the alias map, or as a size container whose sizes the ERP",
          "holds. This is the state to keep the report in; anything appearing here is a",
          "page selling stock no system can confirm.",
          "",
        ]),
    ...(byChannel("clearance").length
      ? [
          `### Clearance (${byChannel("clearance").length})`,
          "",
          "A-prefixed ex-display stock, listed on /clearance.",
          "",
          "| SKU | product | image renders |",
          "|---|---|---|",
          ...byChannel("clearance").map((r) => `| \`${r.code}\` | ${r.name} | ${r.renders ? "yes" : "**no**"} |`),
          "",
        ]
      : []),
    ...(byChannel("public").length
      ? [
          `### Our own codes (${byChannel("public").length})`,
          "",
          "| SKU | product | image renders |",
          "|---|---|---|",
          ...byChannel("public").map((r) => `| \`${r.code}\` | ${r.name} | ${r.renders ? "yes" : "**no**"} |`),
          "",
        ]
      : []),
    ...(stranded.length
      ? [
          `## Size pickers backed by nothing (${stranded.length})`,
          "",
          "These are containers, so the ERP is right not to hold the container —",
          "but it holds none of the SIZES either, under any code. The page renders a",
          "picker and the ERP cannot price or stock a single option behind it.",
          "",
          "| SKU | product | channel |",
          "|---|---|---|",
          ...stranded.map((r) => `| \`${r.code}\` | ${r.name} | ${r.channel} |`),
          "",
        ]
      : []),
    `Every row, including the harmless ones, is in \`${CSV}\`.`,
    "",
  ];
  writeFileSync(MD, md.join("\n"));

  console.log(
    `orphans: ${rows.length} total, ${actionable.length} needing a decision, ${stranded.length} stranded containers`
  );
});
