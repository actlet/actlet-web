import csv
import sys
from collections import defaultdict

totals = defaultdict(int)
for row in csv.DictReader(open(sys.argv[1])):
    totals[row["region"]] += int(row["revenue_eur"])
for region, revenue in sorted(totals.items()):
    print(f"{region}: {revenue} EUR")
