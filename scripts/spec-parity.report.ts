// Does Supabase say the same thing about a spec as the frozen snapshot does?
//
//   npm run check:specs
//
// WHY THIS EXISTS. lib/product-content.ts reads a spec off a product_content row
// only when a HUMAN edited it; a loader-owned row is the snapshot copied, so it
// is skipped and the page renders what it has always rendered. That rule is what
// made the read path safe to ship before the data landed, and it is also what
// stops specification_text from ever being retired: the blob stays load-bearing
// for all 414 products until the page trusts loader rows too.
//
// THIS IS THE GATE FOR THAT FLIP. Preferring loader rows is only safe if they
// are byte-identical to what parseProductDetail produces today. If they are not,
// flipping silently changes measurements on live product pages — a wrong
// assembled size or a warranty that promises the wrong cover, with nothing in
// the UI to show it changed.
//
// WHAT COUNTS AS A FAULT, and what does not:
//
//   LOST      the snapshot has a value and the database does not. The flip
//             would DELETE a spec row from a live page. Always a fault.
//   CHANGED   both have a value and they disagree. On a loader-owned row this
//             is a loader bug. On a human-edited row it is the entire point of
//             the table and is reported separately.
//   GAINED    the database has a value the snapshot never did. A human filling
//             a gap — the Functional Trainer's missing Packing size, say.
//   MISSING   the product has no row at all. A fault only if content.load
//             should have written one, which is why this replicates its exact
//             skip rules rather than comparing against every product.
//
// IT IS NOT A DEPLOY GATE, for the same reason check:mirror is not: it reads a
// live database and fails when that database is having a bad afternoon. Run it
// before flipping the reader, and after any change to content.load.
import { it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { allProducts } from "@/lib/catalogue";
import { parseProductDetail, isObsolete, type WcProduct } from "@/lib/woocommerce";
import { SPEC_FIELDS } from "@/lib/spec";

// vitest.reports.config.mts does not load .env.local — `npm test` is offline and
// pure on purpose — so this reads it the way content.load.ts already does.
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const OUT = "reports/spec-parity.md";
/** Must match scripts/content.load.ts. A row stamped this is the snapshot, copied. */
const LOADER = "content.load";

type Verdict = "lost" | "changed" | "gained";
type Finding = { code: string; slug: string; field: string; snapshot: string; db: string };

it(
  "spec parity",
  async () => {
    // The snapshot side, built with content.load's OWN skip rules. Comparing
    // against every product in the catalogue instead would report a few hundred
    // obsolete and copy-less SKUs as "missing from the database", which is the
    // loader working correctly and would bury the findings that matter.
    const expected = new Map<string, { slug: string; specs: Map<string, string> }>();
    for (const p of allProducts() as WcProduct[]) {
      const code = (p.sku ?? "").trim().toUpperCase();
      if (!code || isObsolete(p)) continue;
      const d = parseProductDetail(p);
      const specs = new Map<string, string>();
      for (const s of d.specs ?? []) {
        const v = s.value.trim();
        if (v) specs.set(s.label, v);
      }
      const has =
        d.overviewShort || d.overviewDescription || (d.features ?? []).length || d.packageInclusions || specs.size;
      if (!has) continue;
      expected.set(code, { slug: p.slug, specs });
    }

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.log("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — nothing to compare against.");
      return;
    }
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db
      .from("product_content")
      .select("erp_code, slug, updated_by, assembled_size, colour, material, net_weight, gross_weight, packing_size, warranty");
    if (error) throw new Error(`product_content: ${error.message}`);

    const rows = new Map<string, Record<string, unknown>>();
    for (const r of data ?? []) rows.set(String(r.erp_code).toUpperCase(), r as Record<string, unknown>);

    const findings: Record<Verdict, Finding[]> = { lost: [], changed: [], gained: [] };
    const editedFindings: Finding[] = [];
    const noRow: { code: string; slug: string }[] = [];
    let compared = 0;
    let agreed = 0;

    for (const [code, want] of expected) {
      const row = rows.get(code);
      if (!row) {
        noRow.push({ code, slug: want.slug });
        continue;
      }
      const edited = row.updated_by !== LOADER;
      for (const [label, col] of SPEC_FIELDS) {
        const snapshot = want.specs.get(label) ?? "";
        const dbv = String(row[col] ?? "").trim();
        if (!snapshot && !dbv) continue;
        compared++;
        if (snapshot === dbv) {
          agreed++;
          continue;
        }
        const f: Finding = { code, slug: want.slug, field: label, snapshot, db: dbv };
        // A human-edited row is SUPPOSED to disagree — that is what the table is
        // for. Kept apart so it cannot be mistaken for a loader fault, and so a
        // clean run stays clean as editors start using it.
        if (edited) {
          editedFindings.push(f);
          continue;
        }
        findings[!dbv ? "lost" : !snapshot ? "gained" : "changed"].push(f);
      }
    }

    const clean = findings.lost.length === 0 && findings.changed.length === 0 && noRow.length === 0;
    const lines: string[] = [];
    const show = (f: Finding) =>
      `- \`${f.code}\` **${f.field}** — snapshot \`${f.snapshot || "(none)"}\` · db \`${f.db || "(none)"}\``;

    lines.push(
      "# Spec parity: the snapshot vs Supabase",
      "",
      "Generated by `npm run check:specs`. Compares what `parseProductDetail`",
      "produces today against the `product_content` spec columns, field by field.",
      "",
      clean
        ? "## ✅ CLEAN — safe to prefer loader-owned rows"
        : "## ❌ NOT CLEAN — do not flip the reader yet",
      "",
      `| | |`,
      `|---|---:|`,
      `| Products the loader should have written | ${expected.size} |`,
      `| …with no row at all | ${noRow.length} |`,
      `| Spec values compared | ${compared} |`,
      `| …identical | ${agreed} |`,
      `| **LOST** (db null, snapshot has one) | **${findings.lost.length}** |`,
      `| **CHANGED** (both set, disagree) | **${findings.changed.length}** |`,
      `| GAINED (db has one, snapshot does not) | ${findings.gained.length} |`,
      `| On human-edited rows (expected) | ${editedFindings.length} |`,
      "",
    );

    if (noRow.length) {
      lines.push("## No row at all", "", "content.load should have written these. It did not.", "");
      for (const n of noRow.slice(0, 40)) lines.push(`- \`${n.code}\` — ${n.slug}`);
      if (noRow.length > 40) lines.push(`- …and ${noRow.length - 40} more`);
      lines.push("");
    }
    for (const [k, title, blurb] of [
      ["lost", "LOST — the flip would delete these rows from a live page", "Always a fault. The loader wrote a null where the page shows a value."],
      ["changed", "CHANGED — both set, and they disagree", "On a loader-owned row this is a loader bug: the stored value is not what the page renders."],
      ["gained", "GAINED — the database knows something the snapshot does not", "Not a fault. A filled gap, or a value the parser stopped resolving."],
    ] as const) {
      const list = findings[k];
      if (!list.length) continue;
      lines.push(`## ${title}`, "", blurb, "");
      for (const f of list.slice(0, 60)) lines.push(show(f));
      if (list.length > 60) lines.push(`- …and ${list.length - 60} more`);
      lines.push("");
    }
    if (editedFindings.length) {
      lines.push(
        "## On human-edited rows",
        "",
        "**Not faults.** Somebody changed these on purpose, and lib/product-content.ts",
        "already serves them to the page today. Listed so an edit is visible, and so a",
        "surprising one can be spotted.",
        "",
      );
      for (const f of editedFindings.slice(0, 40)) lines.push(show(f));
      if (editedFindings.length > 40) lines.push(`- …and ${editedFindings.length - 40} more`);
      lines.push("");
    }

    lines.push(
      "## Reading this",
      "",
      "**A clean run is the gate for preferring loader-owned rows** in",
      "`lib/product-content.ts` — the change that finally retires",
      "`specification_text`. Until then the blob is still what every unedited",
      "product renders from.",
      "",
      "**LOST is the one that hurts.** A spec row that vanishes from a live page is",
      "invisible in testing: the page still renders, the table is just shorter.",
      "",
      "**GAINED is usually fine and occasionally a warning.** A gap someone filled is",
      "the system working. The whole catalogue gaining the same field at once means",
      "the parser stopped resolving a label and the database is now the only place",
      "it survives.",
      "",
      `_Last run: ${new Date().toISOString().slice(0, 16).replace("T", " ")}Z_`,
      "",
    );

    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, lines.join("\n") + "\n");

    console.log(
      `${expected.size} products, ${compared} spec values compared, ${agreed} identical\n` +
        `  LOST ${findings.lost.length}, CHANGED ${findings.changed.length}, ` +
        `GAINED ${findings.gained.length}, no row ${noRow.length}\n` +
        `  on human-edited rows ${editedFindings.length} (expected)\n` +
        (clean ? "  CLEAN — safe to prefer loader-owned rows" : "  NOT CLEAN — do not flip the reader")
    );
  },
  180_000
);
