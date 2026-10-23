#!/usr/bin/env python3
"""Validate the Twenty target schema, and (with --apply) add the two fields the
migration needs that the workspace doesn't have yet:

  company.externalOrgId   (TEXT)      — idempotency key for org donors
  donation.processingFee  (CURRENCY)  — Aplos line expense_amount

Default is READ-ONLY (reports gaps, writes nothing). --apply mutates the
PRODUCTION schema and is idempotent (skips fields that already exist).

Usage:
  python3 scripts/twenty_validate.py          # check only
  python3 scripts/twenty_validate.py --apply  # add the two missing fields
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.twenty import TwentyClient, TwentyError  # noqa: E402

REQUIRED_OBJECTS = ["person", "company", "donation", "donationCredit", "fund"]

# Fields the migration relies on. (object, field) -> must already exist.
REQUIRED_FIELDS = [
    ("person", "externalDonorId"),
    ("person", "name"),
    ("donation", "externalTransactionId"),
    ("donation", "amount"),
    ("donation", "giftDate"),
    ("donation", "acknowledgmentStatus"),
    ("donation", "fund"),
    ("donation", "company"),
    ("donationCredit", "donation"),
    ("donationCredit", "person"),
    ("donationCredit", "creditType"),
    ("donationCredit", "creditRole"),
    ("donationCredit", "creditAmount"),
    ("fund", "fundCode"),
]

# Fields we add if missing: (object, spec).
FIELDS_TO_ENSURE = [
    ("company", {"type": "TEXT", "name": "externalOrgId", "label": "External Org ID"}),
    ("donation", {"type": "CURRENCY", "name": "processingFee", "label": "Processing Fee"}),
    ("donationCredit", {"type": "TEXT", "name": "externalCreditId", "label": "External Credit ID"}),
]


def main() -> int:
    apply = "--apply" in sys.argv[1:]
    client = TwentyClient()
    try:
        objects = client.list_objects()
    except TwentyError as exc:
        print(f"FAILED to read metadata: {exc}", file=sys.stderr)
        return 1

    ok = True

    print("=== Objects ===")
    for name in REQUIRED_OBJECTS:
        present = name in objects
        ok = ok and present
        print(f"  {'OK ' if present else 'MISSING'} {name}")

    print("\n=== Required fields ===")
    for obj, field in REQUIRED_FIELDS:
        present = field in objects.get(obj, {}).get("fields", {})
        ok = ok and present
        print(f"  {'OK ' if present else 'MISSING'} {obj}.{field}")

    print("\n=== Fields to ensure (migration adds these) ===")
    to_create = []
    for obj, spec in FIELDS_TO_ENSURE:
        meta = objects.get(obj)
        if not meta:
            print(f"  ! cannot add {obj}.{spec['name']} — object {obj} missing")
            ok = False
            continue
        if spec["name"] in meta["fields"]:
            print(f"  OK     {obj}.{spec['name']} already exists")
        else:
            print(f"  TODO   {obj}.{spec['name']} ({spec['type']}) — not present")
            to_create.append((meta["id"], obj, spec))

    if not to_create:
        print("\nSchema is fully ready. No fields to add.")
        return 0 if ok else 1

    if not apply:
        print(
            f"\n{len(to_create)} field(s) need to be added. "
            "Re-run with --apply to create them (PRODUCTION schema write)."
        )
        return 0 if ok else 1

    print(f"\n--apply: creating {len(to_create)} field(s) on PRODUCTION schema…")
    for object_id, obj, spec in to_create:
        try:
            created = client.create_field(object_id, spec)
            print(f"  + {obj}.{created['name']} ({created['type']}) created")
        except TwentyError as exc:
            print(f"  ! {obj}.{spec['name']} failed: {exc}", file=sys.stderr)
            return 1
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
