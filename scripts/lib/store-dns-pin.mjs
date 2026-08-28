// Point the store hostname at an IP, for as long as the store has no working DNS.
//
// WHY THIS EXISTS. The 27 August cutover gave `masterkraft.com` to Vercel. The
// WooCommerce install is untouched and still serving on the old server, but it
// lost its name: every request to `masterkraft.com/wp-json` now answers from
// Vercel with a 403. That is what breaks `check:catalogue`, and because
// `predeploy` is an `&&` chain, a broken check means no deploy at all rather
// than a skipped step.
//
// So the snapshot check could not run at exactly the moment the snapshot is the
// only thing the shop renders from. This restores it by resolving that one
// hostname ourselves.
//
// THIS IS A SPLINT, NOT A FIX. Delete `WC_STORE_PIN` the day the store has a
// real hostname again (see docs/email-paul-subdomain.md). Three things keep it
// from quietly outliving its purpose:
//
//   * it does nothing unless `WC_STORE_PIN` is set;
//   * it says so on stderr, every single run, rather than pinning silently;
//   * it only pins the one host named in the variable. When `WC_STORE_URL`
//     moves to a subdomain the pin stops matching, says it is stale, and the
//     scripts go back to ordinary DNS on their own.
//
// TLS IS STILL FULLY VERIFIED. We override name resolution, nothing else. The
// server's certificate covers `masterkraft.com` and `www.masterkraft.com`, so it
// validates normally against the pinned address. Nothing here disables
// certificate checking, and nothing here should ever need to. If you find
// yourself reaching for NODE_TLS_REJECT_UNAUTHORIZED, you are solving a
// different problem than this file solves.
//
// Do not reach the store over plain http on the bare IP instead. That host
// serves its vhosts by name, so the bare IP 404s, and the WooCommerce consumer
// key would go over the wire in clear text.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import dns from "node:dns";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function fromEnvFile(name) {
  if (process.env[name]) return process.env[name];
  try {
    const text = readFileSync(join(ROOT, ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const eq = line.indexOf("=");
      if (eq > 0 && line.slice(0, eq).trim() === name) {
        return line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // No .env.local is normal on CI. Nothing to pin.
  }
  return undefined;
}

const spec = fromEnvFile("WC_STORE_PIN");

if (spec) {
  const [host, address] = spec.split("=").map((s) => s.trim());
  if (!host || !address) {
    throw new Error(`WC_STORE_PIN must look like "masterkraft.com=1.2.3.4", got "${spec}"`);
  }

  // A pin aimed at a host we no longer talk to is worse than no pin: it reads
  // like the store is still stranded when it is not. Say so, and do nothing.
  const storeUrl = fromEnvFile("WC_STORE_URL");
  const storeHost = storeUrl ? new URL(storeUrl).hostname : undefined;
  if (storeHost && storeHost !== host) {
    console.warn(
      `store-dns-pin: STALE. WC_STORE_PIN pins ${host}, but WC_STORE_URL is now ${storeHost}.\n` +
        `                Nothing was pinned. Delete WC_STORE_PIN from .env.local.`,
    );
  } else {
    const real = dns.lookup.bind(dns);
    dns.lookup = (hostname, options, callback) => {
      if (hostname !== host) return real(hostname, options, callback);
      // Node's own resolver is called both ways round, and undici asks for
      // `all`. Answer in whichever shape the caller used.
      const opts = typeof options === "function" ? {} : options ?? {};
      const done = typeof options === "function" ? options : callback;
      return opts.all
        ? done(null, [{ address, family: 4 }])
        : done(null, address, 4);
    };
    console.warn(
      `store-dns-pin: ${host} -> ${address} (WC_STORE_PIN). The store has no working\n` +
        `                DNS name yet. Remove WC_STORE_PIN once it does.`,
    );
  }
}
