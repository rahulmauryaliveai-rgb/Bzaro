#!/usr/bin/env python3
"""
Build prisma/seed/data/in-pincodes.csv from India Post's All India Pincode
Directory (one row per post office, ~157k rows, ~19.3k PIN codes).

Source: data.gov.in "All India Pincode Directory with contact details along
with Latitude and Longitude" (Department of Posts), published under the
Government Open Data License - India. Mirror used in 2026-09:
https://raw.githubusercontent.com/dropdevrahul/pincodes-india/main/pincode.csv

    python3 scripts/pincodes/build-in-pincodes.py pincode.csv > /dev/null

Output: one row per PIN code — pincode, district, state (title case),
latitude, longitude. The directory's coordinates are unreliable (Noida HO is
listed ~300 km from Noida), so per PIN code:
  1. district = the district most of its offices are in;
  2. drop office coordinates outside India or > 50 km from the median of all
     offices in that district;
  3. coordinate = median of what is left, rounded to 4 dp (~11 m);
  4. nothing left -> no coordinate. The PIN still resolves when typed; it is
     just never picked by the "use my location" nearest-PIN lookup.
City mapping is NOT done here — prisma/seed/pincodes.ts maps PIN codes to our
Location rows at seed time, because Location ids differ per database.
"""
import collections
import csv
import math
import os
import statistics
import sys

SMALL = {"and", "of", "the", "in"}


def title(text: str) -> str:
    words = " ".join(text.split()).lower().split(" ")
    return " ".join(w if (i and w in SMALL) else w[:1].upper() + w[1:] for i, w in enumerate(words))


def num(text):
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def in_india(lat, lng):
    return lat is not None and lng is not None and 6 <= lat <= 37.6 and 68 <= lng <= 97.5


def km(a, b):
    mid = math.radians((a[0] + b[0]) / 2)
    return math.hypot((a[0] - b[0]) * 111.2, (a[1] - b[1]) * 111.2 * math.cos(mid))


def main(src: str) -> None:
    rows = list(csv.DictReader(open(src, encoding="utf-8", errors="replace")))
    norm = lambda r: (" ".join(r["StateName"].split()).upper(), " ".join(r["District"].split()).upper())

    by_district = collections.defaultdict(list)
    for r in rows:
        lat, lng = num(r["Latitude"]), num(r["Longitude"])
        if in_india(lat, lng):
            by_district[norm(r)].append((lat, lng))
    district_median = {
        k: (statistics.median(p[0] for p in v), statistics.median(p[1] for p in v))
        for k, v in by_district.items()
    }

    by_pin = collections.defaultdict(list)
    for r in rows:
        by_pin[r["Pincode"].strip()].append(r)

    out, stats = [], collections.Counter()
    for pin, offices in sorted(by_pin.items()):
        if not (len(pin) == 6 and pin.isdigit() and pin[0] != "0"):
            stats["invalid pin skipped"] += 1
            continue
        key = collections.Counter(norm(r) for r in offices).most_common(1)[0][0]
        centre = district_median.get(key)
        points = [(num(r["Latitude"]), num(r["Longitude"])) for r in offices if norm(r) == key]
        points = [p for p in points if in_india(*p) and (centre is None or km(p, centre) <= 50)]
        if points:
            coord = (statistics.median(p[0] for p in points), statistics.median(p[1] for p in points))
            stats["with coordinate"] += 1
        else:
            coord = None
            stats["no trustworthy coordinate"] += 1
        state, district = title(key[0]), title(key[1])
        for field in (state, district):
            assert "," not in field and '"' not in field, field
        out.append((pin, district, state, coord))

    dest = os.path.join(os.path.dirname(__file__), "..", "..", "prisma", "seed", "data", "in-pincodes.csv")
    with open(dest, "w", newline="", encoding="utf-8") as fh:
        fh.write("pincode,district,state,latitude,longitude\n")
        for pin, district, state, coord in out:
            lat, lng = ("%.4f" % coord[0], "%.4f" % coord[1]) if coord else ("", "")
            fh.write(f"{pin},{district},{state},{lat},{lng}\n")
    print(f"{len(out)} PIN codes -> {os.path.normpath(dest)}  {dict(stats)}", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "pincode.csv")
