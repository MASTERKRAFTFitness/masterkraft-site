// Import the MasterKraft resources library (Dropbox) into the site.
//
//   node scripts/import-manuals.mjs [sourceDir]
//
// The original 24 manuals were lost when the PDFs were deleted from the
// WordPress uploads folder (they were never archived anywhere), so every
// document is now copied into public/manuals/ and served by this site rather
// than hot-linked from WordPress. Re-run this whenever the Dropbox folder gains
// new documents; it is idempotent and rewrites src/lib/resource-docs.json.
//
// Expected source layout:
//   <SKU> <PRODUCT NAME>/<SKU> <NAME> (<DOC TYPE>).pdf   -> multi-doc product
//   <SKU>- <PRODUCT NAME>.pdf                            -> single-doc product
//   LED-Installation Guides/*.pdf                        -> generic guide
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2]
  || '/Users/michaelwines/Library/CloudStorage/Dropbox-Masterkraft/MANAGEMENT/MASTERKRAFT/MARKETING/FREELANCER - MICHAEL WINES/Resources';
const ROOT = path.resolve(import.meta.dirname, '..');
const MANUALS = path.join(ROOT, 'public/manuals');
const THUMBS = path.join(ROOT, 'public/resources');

if (!fs.existsSync(SRC)) {
  console.error(`source folder not found:\n  ${SRC}`);
  process.exit(1);
}
fs.mkdirSync(MANUALS, { recursive: true });
fs.mkdirSync(THUMBS, { recursive: true });

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const BASE = `${env.WC_STORE_URL}/wp-json/wc/v3`;
const auth = 'Basic ' + Buffer.from(`${env.WC_CONSUMER_KEY}:${env.WC_CONSUMER_SECRET}`).toString('base64');

const kebab = (s) => s.toLowerCase().replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const titleCase = (s) => s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());

// Product names + thumbnails come from the catalogue, not the folder names, so
// they match what the shop calls each product.
const all = [];
for (let page = 1; page <= 20; page++) {
  const res = await fetch(`${BASE}/products?per_page=100&status=publish&page=${page}`, { headers: { Authorization: auth } });
  all.push(...await res.json());
  if (page >= Number(res.headers.get('x-wp-totalpages') || 1)) break;
}
const bySku = new Map(all.map((p) => [(p.sku || '').trim().toUpperCase(), p]));
const overrides = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/lib/product-image-overrides.json'), 'utf8'));

// Long supplier filenames make poor row labels; these read better in the popup.
const RENAME = {
  'How To Add The Grease To The Axle Of Magnet Group': 'Greasing the Magnet Axle',
  'How To Replace Spring': 'Replacing the Spring',
  'Noise Issue': 'Noise Troubleshooting',
};
// Entries with no catalogue product behind them fall back to a category image.
const FALLBACK_THUMB = {
  MRSPATT0X: '/category/rigs-racks.jpg',
  MERK153001: '/category/equipment-storage.jpg',
  'Installation Guide': '/category/flooring.jpg',
};

function labelFor(file, sku) {
  const stem = file.replace(/\.(pdf|jpe?g|png)$/i, '');
  const bracket = stem.match(/\(([^)]+)\)\s*$/);
  let label;
  if (bracket) {
    label = titleCase(bracket[1]).replace(/\bAirplus\b/i, 'AirPlus');
  } else {
    let tail = stem.replace(new RegExp(`^${sku}\\s*[-–]?\\s*`, 'i'), '').replace(/^MCTMSPO2\s*/i, '').trim();
    label = tail ? titleCase(tail) : 'Product Guide';
  }
  return RENAME[label] ?? label;
}

const products = new Map();
const add = (key, meta, manual) => {
  if (!products.has(key)) products.set(key, { ...meta, manuals: [] });
  products.get(key).manuals.push(manual);
};
let copied = 0;
const copy = (from, name) => { fs.copyFileSync(from, path.join(MANUALS, name)); copied++; return `/manuals/${name}`; };

for (const e of fs.readdirSync(SRC, { withFileTypes: true })) {
  const full = path.join(SRC, e.name);

  if (e.isDirectory()) {
    if (/^LED/i.test(e.name)) {
      for (const f of fs.readdirSync(full).filter((f) => /\.pdf$/i.test(f))) {
        add('LED', { name: 'LED Installation Guide', sub: 'Installation Guide', sku: null },
          { label: 'LED Installation Guide', download: copy(path.join(full, f), `${kebab(f.replace(/\.pdf$/i, ''))}.pdf`), external: false });
      }
      continue;
    }
    const m = e.name.match(/^([A-Z0-9]+)\s+(.+)$/i);
    if (!m) { console.log('SKIP dir:', e.name); continue; }
    const sku = m[1].toUpperCase();
    const name = bySku.get(sku)?.name ?? titleCase(m[2]);
    for (const f of fs.readdirSync(full).filter((f) => /\.(pdf|jpe?g|png)$/i.test(f)).sort()) {
      const label = labelFor(f, sku);
      add(sku, { name, sub: sku, sku },
        { label, download: copy(path.join(full, f), `${kebab(sku)}-${kebab(label)}${path.extname(f).toLowerCase()}`), external: false });
    }
    continue;
  }

  if (!/\.(pdf|jpe?g|png)$/i.test(e.name)) continue;
  if (/RUBBER TILE/i.test(e.name)) continue; // already hosted locally

  const m = e.name.match(/^([A-Z0-9]+)\s*[-–]\s*(.+?)\.(pdf|jpe?g|png)$/i);
  if (!m) { console.log('SKIP file:', e.name); continue; }
  const sku = m[1].toUpperCase();
  const ext = path.extname(e.name).toLowerCase();
  add(sku, { name: bySku.get(sku)?.name ?? titleCase(m[2]), sub: sku, sku },
    // A loose image here is an exploded assembly drawing, not a product photo.
    { label: ext === '.pdf' ? 'Product Guide' : 'Exploded Drawing', download: copy(full, `${kebab(sku)}-${kebab(m[2])}${ext}`), external: false });
}

for (const p of products.values()) {
  p.thumb = null;
  if (p.sku) {
    const ovr = overrides[p.sku];
    if (ovr?.length) { p.thumb = ovr[0]; continue; }
    const src = bySku.get(p.sku)?.images?.[0]?.src;
    if (src) {
      try {
        const r = await fetch(src);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        fs.writeFileSync(path.join(THUMBS, `${kebab(p.sku)}.jpg`), Buffer.from(await r.arrayBuffer()));
        p.thumb = `/resources/${kebab(p.sku)}.jpg`;
        continue;
      } catch (err) { console.log('thumb failed', p.sku, err.message); }
    }
  }
  p.thumb = FALLBACK_THUMB[p.sub] ?? null;
}

const ORDER = ['Console Manual', 'Owners Manual', 'Assembly Guide', 'Exploded Drawing', 'Part List', 'Maintenance'];
const rank = (l) => { const i = ORDER.indexOf(l); return i === -1 ? ORDER.length : i; };

const out = [...products.values()].map(({ name, sub, thumb, manuals }) => ({
  name, sub, thumb,
  manuals: manuals.sort((a, b) => rank(a.label) - rank(b.label) || a.label.localeCompare(b.label)),
}));

// The Curved Treadmill Pro assembly guide predates the Dropbox set and is not in
// it; it is already hosted locally, so keep serving it.
const tm = out.find((d) => d.sub === 'MCTMSP01');
if (tm && !tm.manuals.some((m) => m.download.includes('assembly'))) {
  tm.manuals.splice(2, 0, { label: 'Assembly Guide', download: '/manuals/curved-treadmill-pro-assembly-guide.pdf', external: false });
}

out.push(
  { name: 'Rubber Tile Installation Guide', sub: 'Flooring Guide', thumb: '/resources/rubber-tile-installation-guide.jpg',
    manuals: [{ label: 'Rubber Tile Installation Guide', download: '/manuals/rubber-tile-installation-guide.pdf', external: false }] },
  { name: 'Flooring Brochure', sub: 'Technical Information', thumb: '/resources/flooring-brochure.jpg',
    manuals: [{ label: 'Flooring Brochure', download: '/manuals/flooring-brochure.pdf', external: false }] },
);

out.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(path.join(ROOT, 'src/lib/resource-docs.json'), JSON.stringify(out, null, 2) + '\n');

const broken = out.flatMap((d) => [d.thumb, ...d.manuals.map((m) => m.download)])
  .filter((p) => p && !fs.existsSync(path.join(ROOT, 'public', p)));
console.log(`copied ${copied} files -> public/manuals/`);
console.log(`products: ${out.length} | documents: ${out.reduce((n, d) => n + d.manuals.length, 0)}`);
console.log(broken.length ? `BROKEN REFS:\n  ${broken.join('\n  ')}` : 'all references resolve');
