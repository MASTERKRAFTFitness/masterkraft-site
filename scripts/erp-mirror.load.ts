// Mirror Unleashed's products into Supabase, by hand.
//
//   npm run mirror:erp         report what WOULD change, write nothing
//   npm run mirror:erp:write   actually write
//
// THE WORK LIVES IN src/lib/erp-mirror.ts AS OF 2026-09-18, and this is now a
// thin wrapper around it. The scheduled refresh — Vercel Cron, hourly, through
// /api/cron/erp-mirror — needed the same work from a route, and a cron and a
// hand-run script that disagree about what a refresh means is how the mirror
// ends up holding something neither of them would have written.
//
// So the rules that used to be described here are enforced there instead: the
// wholesale overwrite, the ex-GST price, the ERP's own axis order, and the
// refusal to shrink the table by more than 10% in one sync. Read that file.
//
// WHAT THIS STILL ADDS, and why it is kept rather than deleted:
//   - it loads .env.local, which a Next route gets from the platform and a
//     script does not;
//   - it writes reports/erp-mirror.md, so a hand-run leaves a record;
//   - it reports by default and writes only behind ERP_MIRROR_WRITE=true.
// Reach for it when you want the mirror refreshed NOW — after a bulk ERP edit,
// or when the cron has been failing and you want the site off the 16-second
// cold start before the next hour.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";

// A Next route reads these from the platform. Out here they have to be loaded.
// Before importing the lib is not required — it reads process.env when called,
// not when imported — but it is done first anyway so the failure mode is
// "missing variable" rather than "Supabase is not configured".
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const REPORT = "reports/erp-mirror.md";
const out = (s: string) => process.stdout.write(`${s}\n`);
const WRITE = process.env.ERP_MIRROR_WRITE === "true";

it(
  "mirrors Unleashed products into Supabase",
  async () => {
    const { refreshErpMirror } = await import("@/lib/erp-mirror");
    const r = await refreshErpMirror({ write: WRITE });

    const summary = [
      `Unleashed products read:  ${r.read}`,
      `  with a price:           ${r.withPrice}`,
      `  with a full carton:     ${r.withCarton}`,
      `  with stock on hand:     ${r.withStock}`,
      ``,
      `rows already in the mirror: ${r.before}`,
      r.refused
        ? `REFUSED: ${r.reason}`
        : !r.ok
          ? `NOT RUN: ${r.reason}`
          : WRITE
            ? `${r.written} rows written, ${r.pruned} stale rows pruned.`
            : `DRY RUN. Nothing written. Set ERP_MIRROR_WRITE=true to apply.`,
      ``,
      `took ${(r.ms / 1000).toFixed(1)}s`,
    ].join("\n");

    mkdirSync("reports", { recursive: true });
    writeFileSync(REPORT, `# ERP mirror\n\n\`\`\`\n${summary}\n\`\`\`\n`);
    out(`\n${summary}\n`);
  },
  900_000
);
