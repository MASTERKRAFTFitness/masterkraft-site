// Proves ANTHROPIC_API_KEY works, before anything depends on it.
//
//   node --env-file=.env.local scripts/check-anthropic.mjs
//
// Written because the WooCommerce credentials sat wrong in Vercel for weeks
// (HANDOFF.md section 7b) purely because nobody checked them after setting them.
// A key is not "set", it is "answering".
//
// Never prints the key. The masked prefix is only there to tell two keys apart.

const key = process.env.ANTHROPIC_API_KEY;

if (!key) {
  console.error("FAIL  ANTHROPIC_API_KEY is not set in this environment.");
  console.error("      Local: add it to .env.local and re-run with --env-file=.env.local");
  console.error("      Vercel: vercel env add ANTHROPIC_API_KEY production, then redeploy");
  process.exit(1);
}

// sk-ant-api03-XXXX... -> sk-ant-…qF7t. Enough to distinguish, useless if leaked.
const masked = `${key.slice(0, 7)}…${key.slice(-4)}`;

const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model: "claude-opus-5",
    max_tokens: 16,
    messages: [{ role: "user", content: "Reply with the single word: ready" }],
  }),
});

const body = await res.json().catch(() => null);

if (!res.ok) {
  const type = body?.error?.type ?? `http_${res.status}`;
  console.error(`FAIL  ${type}: ${body?.error?.message ?? res.statusText}`);
  if (res.status === 401) {
    console.error(`      The key ${masked} was rejected. Wrong value, or revoked.`);
  } else if (res.status === 400 && /credit|balance/i.test(body?.error?.message ?? "")) {
    console.error("      Key is valid but the workspace has no credit or has hit its spend limit.");
  } else if (res.status === 429) {
    console.error("      Rate limited. The key works; try again shortly.");
  }
  process.exit(1);
}

const text = body.content?.find((b) => b.type === "text")?.text?.trim() ?? "";
const used = (body.usage?.input_tokens ?? 0) + (body.usage?.output_tokens ?? 0);

console.log(`OK    key ${masked} is answering`);
console.log(`      model:  ${body.model}`);
console.log(`      replied: "${text}"`);
console.log(`      tokens: ${used} (this check costs a fraction of a cent)`);
console.log("");
console.log("Both the support desk and the public chat widget read this same key.");
