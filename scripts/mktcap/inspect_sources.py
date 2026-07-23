import csv, os
here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
keys = ("ByteDance", "OpenAI", "Stripe", "SpaceX", "Anthropic", "Fanatics")
print("=== source_public.csv matches ===")
for r in csv.DictReader(open(os.path.join(here, "source_public.csv"), encoding="utf-8")):
    if any(k.lower() in r["Name"].lower() for k in keys):
        print(repr(r["Rank"]), repr(r["Name"]), repr(r["Symbol"]), r["marketcap"], repr(r["country"]))
print("=== source_unicorns.csv matches ===")
for r in csv.DictReader(open(os.path.join(here, "source_unicorns.csv"), encoding="utf-8")):
    if any(k.lower() in r["Company"].lower() for k in keys):
        print(repr(r["Company"]), r["ValuationBn"], repr(r["Country"]))
