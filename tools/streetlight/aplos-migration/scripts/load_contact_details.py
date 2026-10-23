#!/usr/bin/env python3
"""Fill donor addresses and phones in Twenty from data/raw/contact_details.json.

Person  <- externalDonorId: mailingAddress (primary Aplos address), phones (primary Aplos phone)
Company <- externalOrgId:   address (primary Aplos address)

Fill-only: a Twenty field that already has a value is never replaced.
DEFAULT IS DRY-RUN. --apply writes to PRODUCTION.

Usage:
  python3 scripts/load_contact_details.py
  python3 scripts/load_contact_details.py --apply
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.env import PROJECT_ROOT  # noqa: E402
from lib.twenty import TwentyClient, TwentyError  # noqa: E402

RAW = PROJECT_ROOT / "data" / "raw"
CONTACT_KEY = "aplos-contact-{}"
STATES = {"texas": "TX", "oklahoma": "OK", "new mexico": "NM"}


def primary(items: list[dict] | None) -> dict | None:
    items = items or []
    return next((i for i in items if i.get("is_primary")), items[0] if items else None)


def to_address(a: dict) -> dict:
    state = (a.get("state") or "").strip()
    state = STATES.get(state.lower(), state.upper() if len(state) == 2 else state)
    return {
        "addressStreet1": (a.get("street1") or "").strip(),
        "addressStreet2": (a.get("street2") or "").strip(),
        "addressCity": (a.get("city") or "").strip(),
        "addressState": state,
        "addressPostcode": (a.get("postal_code") or "").strip(),
        "addressCountry": (a.get("country") or "United States").strip(),
    }


def to_phone(p: dict) -> dict | None:
    digits = re.sub(r"\D", "", p.get("telnum") or "")
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) != 10:
        return None
    return {
        "primaryPhoneNumber": digits,
        "primaryPhoneCountryCode": "US",
        "primaryPhoneCallingCode": "+1",
        "additionalPhones": [],
    }


def has_address(v: dict | None) -> bool:
    return bool(v and (v.get("addressStreet1") or v.get("addressCity")))


def has_phone(v: dict | None) -> bool:
    return bool(v and v.get("primaryPhoneNumber"))


def plan(client: TwentyClient) -> list[tuple[str, str, dict]]:
    details = json.loads((RAW / "contact_details.json").read_text())
    people = {p["externalDonorId"]: p for p in client.rest_get_all("people") if p.get("externalDonorId")}
    companies = {c["externalOrgId"]: c for c in client.rest_get_all("companies") if c.get("externalOrgId")}
    updates = []
    bad_phones = 0
    for cid, d in details.items():
        key = CONTACT_KEY.format(cid)
        addr = primary(d.get("addresses"))
        if key in people:
            rec, payload = people[key], {}
            if addr and not has_address(rec.get("mailingAddress")):
                payload["mailingAddress"] = to_address(addr)
            ph = primary(d.get("phones"))
            if ph and not has_phone(rec.get("phones")):
                phone = to_phone(ph)
                if phone:
                    payload["phones"] = phone
                else:
                    bad_phones += 1
            if payload:
                updates.append(("people", rec["id"], payload))
        elif key in companies:
            rec = companies[key]
            if addr and not has_address(rec.get("address")):
                updates.append(("companies", rec["id"], {"address": to_address(addr)}))
    print(f"skipped {bad_phones} phones that are not 10-digit US numbers")
    return updates


def main() -> int:
    apply = "--apply" in sys.argv[1:]
    client = TwentyClient()
    updates = plan(client)
    count = lambda obj, field: sum(1 for o, _, p in updates if o == obj and field in p)
    print(f"people mailingAddress: {count('people', 'mailingAddress')}")
    print(f"people phones:         {count('people', 'phones')}")
    print(f"company address:       {count('companies', 'address')}")
    if not apply:
        print("\nDry-run only. Re-run with --apply to write to PRODUCTION.")
        return 0
    failed = 0
    for i, (obj, rid, payload) in enumerate(updates, 1):
        try:
            client.update(obj, rid, payload)
        except TwentyError as exc:
            failed += 1
            print(f"  ! {obj} {rid}: {exc}", file=sys.stderr)
        if i % 100 == 0:
            print(f"  …{i}/{len(updates)}", flush=True)
    print(f"\nUpdated {len(updates) - failed}, failed {failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
