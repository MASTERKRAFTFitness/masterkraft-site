// Submit every URL in the live sitemap to IndexNow, for after a change that
// touches many pages at once (titles, descriptions, structured data). New blog
// posts are submitted on publish already; see src/lib/indexnow.ts.
//
//   npm run indexnow:submit             # the whole sitemap
//   npm run indexnow:submit -- --dry    # count, do not send
//
// Reads the PRODUCTION sitemap, not a local build, so it can only ever submit
// URLs that are already live. The key must match src/lib/indexnow.ts and the
// file in public/.
const SITE = "https://masterkraft.com";
const KEY = "7e050e9cdb80d82f8271957656b67fd9";
const dry = process.argv.includes("--dry");

const keyFile = await fetch(`${SITE}/${KEY}.txt`);
if (!keyFile.ok || (await keyFile.text()).trim() !== KEY) {
  console.error(`Key file ${SITE}/${KEY}.txt is not live yet (HTTP ${keyFile.status}). Deploy first.`);
  process.exit(1);
}

const xml = await (await fetch(`${SITE}/sitemap.xml`)).text();
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()).filter((u) => u.startsWith(SITE));
console.log(`${urls.length} URLs in the sitemap`);
if (dry) process.exit(0);

for (let i = 0; i < urls.length; i += 10_000) {
  const batch = urls.slice(i, i + 10_000);
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: "masterkraft.com", key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList: batch }),
  });
  // 200 = accepted, 202 = accepted, key validation pending. Anything else is a problem.
  console.log(`batch ${i / 10_000 + 1}: HTTP ${res.status} for ${batch.length} URLs ${await res.text()}`);
  if (res.status !== 200 && res.status !== 202) process.exitCode = 1;
}
