#!/usr/bin/env python3
"""Landed-price comparison against Little Bloke Fitness, and the Google Ads upload it feeds.

THE RULE (MasterKraft, 5-6 Oct 2026): pay to promote a product only when it is in
stock and the shopper's total cost, product plus delivery, is no more than 5%
above Little Bloke's in that city. Delivery decides most of it: Little Bloke
charges a flat parcel rate per state, ours is quoted per carton, so a product
can win in Melbourne and lose in Perth.

HOW IT MEASURES. Each size in matches.json is quoted to Melbourne 3000, Sydney
2000 and Perth 6000 twice: ours through the live site's /api/freight/quote, theirs
through their own Shopify checkout shipping calculator. Plates compare their pair
against two of ours (ourQty 2, theirQty 1). Little Bloke prices are re-read from
their catalogue on every run; ours come from ours.json (see INPUT).

INPUT. By default our prices and stock come from the live site (see
site_prices). Or pass --ours, a list of {"code", "price" (A$ inc GST), "stock"}
for the codes in matches.json, taken from the Unleashed mirror the same day:
    select erp_code as code, round(price * 1.1, 2) as price, stock
    from erp_products where erp_code in (<codes>);
(Supabase project masterkraft-site, table erp_products.)

PUBLISHING. With --publish the qualifying list also goes to
public/merchant-center-promotion.csv, served at masterkraft.com/merchant-center-promotion.csv.
Merchant Center fetches that URL daily as a supplemental source, so merging the
change is what moves products in and out of the paid campaigns.

OUTPUT, in --out (default reports/landed-price/<YYYY-MM>/):
    merchant-center-supplemental-feed.csv   id,custom_label_4 for the qualifying sizes
    google-ads-item-ids-<label>.txt          the same, one list per campaign
    results.json                             every quote, gap and decision
    summary.md                               what qualifies and why the rest does not

The supplemental feed is uploaded in Merchant Center (Settings > Data sources >
supplemental source); Google Ads campaigns filter on custom_label_4:
ads-national, ads-vic-nsw, ads-vic, ads-nsw-wa (any other city combination is
written the same way).

NETWORK. Needs littleblokefitness.com.au, www.littleblokefitness.com.au and
web.test.masterkraft.com allowed. Little Bloke shows a bot check when hit too
fast, so requests are paced and every quote retries; a full run takes ~45 min.
Re-running with the same --out resumes from results.json.
"""
import argparse, datetime, json, os, subprocess, sys, time, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
LBF = "https://www.littleblokefitness.com.au"
OURS_QUOTE = "https://web.test.masterkraft.com/api/freight/quote"
CITIES = [("Melbourne", "VIC", "3000", "vic"), ("Sydney", "NSW", "2000", "nsw"), ("Perth", "WA", "6000", "wa")]
TOLERANCE = 1.05  # within 5% of Little Bloke's landed price
UA = "Mozilla/5.0"


def curl(args, jar=None, timeout=45):
    cmd = ["curl", "-sS", "-m", str(timeout), "-A", UA]
    if jar:
        cmd += ["-c", jar, "-b", jar]
    return subprocess.run(cmd + args, capture_output=True, text=True).stdout


def lbf_catalogue():
    products, page = [], 1
    while True:
        for attempt in range(4):
            out = curl([f"{LBF}/products.json?limit=250&page={page}"])
            try:
                batch = json.loads(out)["products"]
                break
            except Exception:
                time.sleep(10 * (attempt + 1))
        else:
            sys.exit(f"could not read Little Bloke catalogue page {page}")
        if not batch:
            return {p["handle"]: p for p in products}
        products += batch
        page += 1
        time.sleep(3)


def our_quote(code, qty, city, state, postcode):
    body = json.dumps({"items": [{"sku": code, "quantity": qty}],
                       "delivery": {"city": city, "state": state, "postcode": postcode, "country": "AU", "line1": "1 Main St"}})
    for _ in range(3):
        out = curl(["-X", "POST", OURS_QUOTE, "-H", "content-type: application/json", "-d", body], timeout=90)
        try:
            sel = json.loads(out).get("selected")
            return sel["price"] if sel else None
        except Exception:
            time.sleep(5)
    return None


def lbf_quote(variant_id, qty, city, state, postcode, jar):
    q = urllib.parse.urlencode({"shipping_address[zip]": postcode, "shipping_address[country]": "Australia",
                                "shipping_address[province]": state, "shipping_address[city]": city})
    for _ in range(3):
        curl(["-X", "POST", f"{LBF}/cart/clear.js", "-d", ""], jar)
        time.sleep(2)
        curl(["-X", "POST", f"{LBF}/cart/add.js", "-H", "content-type: application/json",
              "-d", json.dumps({"items": [{"id": variant_id, "quantity": qty}]})], jar)
        time.sleep(2)
        curl(["-X", "POST", "-d", "", f"{LBF}/cart/prepare_shipping_rates.json?{q}"], jar)
        for _ in range(8):
            time.sleep(4)
            out = curl([f"{LBF}/cart/async_shipping_rates.json?{q}"], jar)
            if out.strip() == "null":
                continue
            try:
                rates = [r for r in json.loads(out).get("shipping_rates") or [] if "pickup" not in r["name"].lower()]
            except Exception:
                break  # bot-check page (HTTP 429): back off and retry the whole cycle
            return min(float(r["price"]) for r in rates) if rates else None
        # Their rate limiter needs minutes, not seconds, to clear.
        time.sleep(90)
    return None


def site_prices(matches):
    """Our price and stock straight from the live site.

    /api/cart/line is what the Google checkout link uses: it returns a cart line
    with the current price only for a code that is in stock, priced and
    freight-quotable, and 404 otherwise. That is exactly the bar for promoting a
    product, so a 404 is recorded as stock 0. A network failure is not: it stops
    the run rather than quietly marking everything out of stock.
    """
    ours = {}
    for m in matches:
        code = m["code"]
        for attempt in range(3):
            r = subprocess.run(["curl", "-sS", "-m", "60", "-w", "\n%{http_code}",
                                f"{OURS_QUOTE.rsplit('/api/', 1)[0]}/api/cart/line?id={code}"],
                               capture_output=True, text=True).stdout.rsplit("\n", 1)
            status = r[-1] if r else ""
            if status == "200":
                ours[code] = {"code": code, "price": json.loads(r[0])["line"]["price"], "stock": 1}
                break
            if status == "404":
                ours[code] = {"code": code, "price": 0, "stock": 0}
                break
            time.sleep(10)
        else:
            sys.exit(f"could not read our price for {code} from the site (HTTP {status})")
    print(f"our prices: {sum(1 for o in ours.values() if o['stock'])} of {len(ours)} in stock", flush=True)
    return ours


def label(regions):
    if not regions:
        return None
    return "national" if len(regions) == len(CITIES) else "-".join(regions)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--ours", help="ours.json: [{code, price, stock}]. Omit to read the live site instead")
    ap.add_argument("--out", default=os.path.join("reports", "landed-price", datetime.date.today().strftime("%Y-%m")))
    ap.add_argument("--only", help="comma-separated codes, for a quick test")
    ap.add_argument("--publish", action="store_true",
                    help="also write public/merchant-center-promotion.csv, the file Merchant Center fetches daily")
    args = ap.parse_args()

    matches = json.load(open(os.path.join(HERE, "matches.json")))
    if args.only:
        keep = set(args.only.upper().split(","))
        matches = [m for m in matches if m["code"] in keep]
    ours = {o["code"].upper(): o for o in json.load(open(args.ours))} if args.ours else site_prices(matches)
    os.makedirs(args.out, exist_ok=True)
    res_path = os.path.join(args.out, "results.json")
    results = json.load(open(res_path)) if os.path.exists(res_path) else {}
    jar = os.path.join(args.out, ".cookies")
    lbf = lbf_catalogue()
    print(f"Little Bloke catalogue: {len(lbf)} products", flush=True)

    # Two passes: Little Bloke's bot check drops some quotes, and the second pass
    # fills only those (complete cities are skipped).
    for m in matches * 2:
        code = m["code"]
        o = ours.get(code)
        r = results.get(code) or {"code": code, "name": m["name"], "match": m["match"], "cities": {}}
        r["ourPrice"] = o and float(o["price"]) * m["ourQty"]
        r["stock"] = o and o.get("stock")
        if not o or not (float(o.get("stock") or 0) > 0):
            r["decision"], r["regions"], r["why"] = "excluded", [], "out of stock or not in ours.json"
        elif not m["littleBloke"]:
            r["decision"], r["regions"], r["why"] = "no-match", [c[3] for c in CITIES], "no Little Bloke equivalent"
        elif m["littleBloke"] not in lbf:
            r["decision"], r["regions"], r["why"] = "review", [], f"Little Bloke product {m['littleBloke']} is gone: re-match it"
        else:
            v = lbf[m["littleBloke"]]["variants"][0]
            r["theirPrice"] = float(v["price"]) * m["theirQty"]
            if not v.get("available"):
                # Nothing to quote delivery on; judge on product price alone.
                ok = r["ourPrice"] <= r["theirPrice"] * TOLERANCE
                r["decision"] = "lbf-out-of-stock"
                r["regions"] = [c[3] for c in CITIES] if ok else []
                r["why"] = f"Little Bloke out of stock; product price {r['ourPrice'] / r['theirPrice'] - 1:+.1%}"
            else:
                for city, state, pc, reg in CITIES:
                    c = r["cities"].get(city)
                    if c and c.get("ours") is not None and c.get("lbf") is not None:
                        continue
                    of = our_quote(code, m["ourQty"], city, state, pc)
                    lf = lbf_quote(v["id"], m["theirQty"], city, state, pc, jar)
                    r["cities"][city] = {"ourFreight": of, "lbfFreight": lf,
                                         "ours": None if of is None else round(r["ourPrice"] + of, 2),
                                         "lbf": None if lf is None else round(r["theirPrice"] + lf, 2)}
                    results[code] = r
                    json.dump(results, open(res_path, "w"), indent=1)
                    print(code, city, of, lf, flush=True)
                    time.sleep(10)
                regions, missing = [], []
                for city, _, _, reg in CITIES:
                    c = r["cities"][city]
                    if c["ours"] is None or c["lbf"] is None:
                        missing.append(city)
                    elif c["ours"] <= c["lbf"] * TOLERANCE:
                        regions.append(reg)
                    c["gapPct"] = None if None in (c["ours"], c["lbf"]) else round((c["ours"] / c["lbf"] - 1) * 100, 1)
                r["regions"] = regions
                r["decision"] = "measured" if not missing else "incomplete"
                r["why"] = "" if not missing else f"no quote for {', '.join(missing)}: re-run to fill"
        r["label"] = label(r["regions"])
        results[code] = r
        json.dump(results, open(res_path, "w"), indent=1)

    rows = sorted(results.values(), key=lambda r: (r["label"] is None, r["label"] or "", r["code"]))
    keep = [r for r in rows if r["label"]]
    with open(os.path.join(args.out, "merchant-center-supplemental-feed.csv"), "w") as f:
        f.write("id,custom_label_4\n" + "".join(f"{r['code']},ads-{r['label']}\n" for r in keep))
    if args.publish and not args.only:
        # Never publish while any quote is missing: an incomplete run would
        # silently drop products from the campaigns.
        incomplete = [r["code"] for r in rows if r.get("decision") in ("incomplete", "review")]
        if incomplete:
            sys.exit(f"not publishing: incomplete or needs review: {', '.join(incomplete)}")
        with open(os.path.join("public", "merchant-center-promotion.csv"), "w") as f:
            f.write("id,custom_label_4\n" + "".join(f"{r['code']},ads-{r['label']}\n" for r in keep))
    for lab in sorted({r["label"] for r in keep}):
        with open(os.path.join(args.out, f"google-ads-item-ids-{lab}.txt"), "w") as f:
            f.write("".join(r["code"] + "\n" for r in keep if r["label"] == lab))

    def gaps(r):
        return " / ".join(f"{c[:3]} {r['cities'][c]['gapPct']:+.1f}%" if r["cities"].get(c, {}).get("gapPct") is not None else f"{c[:3]} -"
                          for c, *_ in CITIES)
    lines = [f"# Landed-price check vs Little Bloke Fitness, {datetime.date.today().isoformat()}", "",
             f"{len(keep)} of {len(rows)} sizes qualify (in stock, and within 5% of Little Bloke landed in at least one city).", "",
             "| Item ID | Product | custom_label_4 | Gap vs Little Bloke (Mel / Syd / Per) | Note |", "| --- | --- | --- | --- | --- |"]
    lines += [f"| {r['code']} | {r['name']} | ads-{r['label']} | {gaps(r)} | {r.get('why') or ''} |" for r in keep]
    lines += ["", "## Not promoted", "", "| Item ID | Product | Gap (Mel / Syd / Per) | Reason |", "| --- | --- | --- | --- |"]
    lines += [f"| {r['code']} | {r['name']} | {gaps(r)} | {r.get('why') or 'over 5% dearer landed in every city'} |" for r in rows if not r["label"]]
    open(os.path.join(args.out, "summary.md"), "w").write("\n".join(lines) + "\n")
    if os.path.exists(jar):
        os.remove(jar)
    print(f"DONE: {len(keep)} qualify; files in {args.out}", flush=True)


if __name__ == "__main__":
    main()
