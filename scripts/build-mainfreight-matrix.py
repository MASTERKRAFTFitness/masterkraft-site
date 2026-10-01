#!/usr/bin/env python3
"""Build the Mainfreight ex-Melbourne freight matrix from its rate card.

    python3 scripts/build-mainfreight-matrix.py <australian_postcodes.csv> [--max-km 100]

Reads, from supabase/rate-cards/:
  mainfreight-ex-melbourne-rates.csv  the rate card (PDF 0390679, effective 30/03/26), one row per destination
  mainfreight-locations.csv           each destination's state and coordinates, decided by hand

Writes, to the same folder:
  mainfreight-postcodes.csv           every postcode, the destination it was given, and how far away that is
  mainfreight-ex-melbourne.sql        the matrix, zones, postcode ranges and rates, ready to run

THE POSTCODE MAPPING IS AN APPROXIMATION. The card names 262 destinations and
says nothing about which postcodes belong to each. Until Mainfreight supply
their own postcode-to-zone listing, every postcode goes to the NEAREST listed
destination (straight-line, from a public postcode-coordinates dataset, e.g.
github.com/matthewproctor/australianpostcodes). Replace this with Mainfreight's
listing when it arrives; nothing else needs to change.

In order, a postcode goes to:
  1. its own destination, where the card names it as exclusive (CBD, islands);
  2. a destination named after one of its own suburbs - 2780 is KATOOMBA even
     though it sits in Greater Sydney;
  3. the capital, when it lies in that capital's metro statistical areas
     (SA4 "Melbourne - ...", "Sydney - ..." etc) - so Mount Druitt is SYDNEY,
     not the nearer KATOOMBA at twice the rate;
  4. otherwise the nearest destination.

Three rules keep the approximation honest:
  - A postcode further than --max-km from every destination is left OUT, so
    the matrix does not cover it and the live carriers (or the quote flow)
    answer instead. A remote address must not borrow a town's rate.
  - Tasmania and the mainland never map across Bass Strait.
  - Destinations with `exclusive_postcodes` (the CENTRAL/CBD zones and the
    islands) take only those postcodes and are never anyone's "nearest".

The matrix is written INACTIVE with a 0% fuel levy. Set the levy, then switch
it on (freight_matrices.active), then set freight_matrix_settings.source.
"""

import argparse
import csv
import math
import re
from collections import defaultdict
from pathlib import Path

DIR = Path(__file__).resolve().parent.parent / "supabase" / "rate-cards"
CODE = "mainfreight-mel"
# The card's weight breaks, in kg. Each rate applies to the WHOLE chargeable
# weight of a consignment in that break (per_kg_on = 'total').
BREAKS = [
    (0, 250, "per_kg_1_250"),
    (250, 500, "per_kg_251_500"),
    (500, 1000, "per_kg_501_1000"),
    (1000, 3000, "per_kg_1001_3000"),
    (3000, 12000, "per_kg_3001_12000"),
    (12000, None, "per_kg_12001_plus"),
]


def km(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def slug(name):
    return re.sub(r"[^A-Z0-9]+", "-", name.upper()).strip("-")


def q(v):
    return "null" if v is None else "'" + str(v).replace("'", "''") + "'"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("postcodes_csv")
    ap.add_argument("--max-km", type=float, default=100)
    args = ap.parse_args()

    rates = list(csv.DictReader(open(DIR / "mainfreight-ex-melbourne-rates.csv")))
    locs = list(csv.DictReader(open(DIR / "mainfreight-locations.csv")))
    assert {r["location"] for r in rates} == {l["location"] for l in locs}, "rates and locations disagree"

    # Postcode centroids, from delivery localities only: a PO box takes no freight.
    points = defaultdict(list)
    state_of = {}
    suburbs = defaultdict(set)
    sa4 = {}
    for r in csv.DictReader(open(args.postcodes_csv)):
        if r["type"] in ("Post Office Boxes", "LVR") or not r["lat"] or float(r["lat"]) == 0:
            continue
        points[int(r["postcode"])].append((float(r["lat"]), float(r["long"])))
        state_of[int(r["postcode"])] = r["state"]
        suburbs[int(r["postcode"])].add(r["locality"].upper())
        # `sa4name`, not SA4_NAME_2021: the 2021 columns in that dataset are
        # misaligned (2770 Mount Druitt reads "Sydney - Sutherland").
        sa4[int(r["postcode"])] = r["sa4name"]

    exclusive = {}
    for l in locs:
        for p in filter(None, l["exclusive_postcodes"].split()):
            exclusive[int(p)] = l["location"]
    open_locs = [l for l in locs if not l["exclusive_postcodes"]]
    by_name = {(l["location"], l["state"]): l for l in open_locs}
    capitals = {"Melbourne": "MELBOURNE", "Sydney": "SYDNEY", "Brisbane": "BRISBANE", "Perth": "PERTH", "Adelaide": "ADELAIDE"}
    where = {l["location"]: (float(l["lat"]), float(l["long"])) for l in locs}
    rule_count = defaultdict(int)

    mapping = {}  # postcode -> (location, km)
    for pc, pts in sorted(points.items()):
        if pc in exclusive:
            mapping[pc] = (exclusive[pc], 0.0)
            continue
        c = (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
        named = sorted(l["location"] for n in suburbs[pc] if (l := by_name.get((n, state_of[pc]))))
        if named:
            mapping[pc] = (named[0], km(c, where[named[0]]))
            rule_count["suburb"] += 1
            continue
        city = capitals.get(sa4.get(pc, "").split(" - ")[0]) if " - " in sa4.get(pc, "") else None
        if city:
            mapping[pc] = (city, km(c, where[city]))
            rule_count["metro"] += 1
            continue
        tas = state_of[pc] == "TAS"
        best = min(
            ((km(c, (float(l["lat"]), float(l["long"]))), l["location"]) for l in open_locs if (l["state"] == "TAS") == tas),
            default=None,
        )
        if best and best[0] <= args.max_km:
            mapping[pc] = (best[1], best[0])
            rule_count["nearest"] += 1

    with open(DIR / "mainfreight-postcodes.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["postcode", "state", "location", "km"])
        for pc in sorted(points):
            loc, d = mapping.get(pc, ("", None))
            w.writerow([f"{pc:04d}", state_of[pc], loc, "" if d is None else round(d, 1)])

    # Consecutive postcodes on the same destination collapse into one range.
    ranges = []
    for pc in sorted(mapping):
        loc = mapping[pc][0]
        if ranges and ranges[-1][0] == loc and ranges[-1][2] == pc - 1:
            ranges[-1][2] = pc
        else:
            ranges.append([loc, pc, pc])

    sql = [
        "-- GENERATED by scripts/build-mainfreight-matrix.py. Do not edit; rerun it.",
        "-- Mainfreight ex Melbourne rate card 0390679 (Express, effective 30/03/26).",
        "-- Postcodes are approximated to the nearest listed destination; see the script.",
        "begin;",
        f"delete from freight_matrices where code = {q(CODE)};",
        "insert into freight_matrices (code, name, carrier, active, basis, per_kg_on, cubic_factor_kg_m3,"
        " fuel_levy_percent, consolidate, notes) values"
        f" ({q(CODE)}, 'Mainfreight ex Melbourne (0390679)', 'Mainfreight', false, 'cost', 'total', 333, 0, true,"
        " 'Rates ex GST and ex FAF. SET fuel_levy_percent BEFORE ACTIVATING. Surcharges (DG 20%, residential,"
        " tailgate, >4m, un-crated machinery at 2.88m height) are NOT modelled. Postcodes approximated.');",
        "insert into freight_zones (matrix_code, code, name, notes) values",
        ",\n".join(
            f"  ({q(CODE)}, {q(slug(l['location']))}, {q(l['location'])}, {q(l['note'] or None)})" for l in locs
        )
        + ";",
        "insert into freight_zone_postcodes (matrix_code, zone_code, postcode_from, postcode_to) values",
        ",\n".join(f"  ({q(CODE)}, {q(slug(loc))}, {a}, {b})" for loc, a, b in ranges) + ";",
        "insert into freight_matrix_rates (matrix_code, zone_code, service, service_level, applies_to,"
        " weight_from_kg, weight_to_kg, price, per_kg, minimum) values",
        ",\n".join(
            f"  ({q(CODE)}, {q(slug(r['location']))}, 'Express freight', 'standard', 'any', {lo}, "
            f"{'null' if hi is None else hi}, {r['basic_charge']}, {r[col]}, {r['minimum']})"
            for r in rates
            for lo, hi, col in BREAKS
        )
        + ";",
        "commit;",
    ]
    (DIR / "mainfreight-ex-melbourne.sql").write_text("\n".join(sql) + "\n")

    covered = len(mapping)
    print(f"{len(locs)} destinations, {len(rates) * len(BREAKS)} rates")
    print(f"{covered}/{len(points)} postcodes covered within {args.max_km:g}km, in {len(ranges)} ranges")
    by_state = defaultdict(lambda: [0, 0])
    for pc in points:
        by_state[state_of[pc]][1] += 1
        by_state[state_of[pc]][0] += pc in mapping
    print("  by rule:", dict(rule_count), "exclusive:", len(exclusive))
    print("  " + ", ".join(f"{s} {a}/{b}" for s, (a, b) in sorted(by_state.items())))


if __name__ == "__main__":
    main()
