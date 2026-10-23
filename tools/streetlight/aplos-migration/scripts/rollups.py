#!/usr/bin/env python3
"""Recompute Person giving rollups after the import (Twenty does not auto-roll).

Aggregates each person's Hard donation credits from live Twenty and sets
Person.lifetimeHardGiving / firstGiftDate / lastGiftDate. (Soft giving stays 0 —
this migration creates only Hard/Donor credits.)

DEFAULT IS DRY-RUN: computes and prints the top donors; writes nothing.
--apply PATCHes only people whose stored values differ.

Usage:
  python3 scripts/rollups.py            # compute + preview (no writes)
  python3 scripts/rollups.py --apply    # PATCH Person rollups in production
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.money import money, micros_to_dollars  # noqa: E402
from lib.twenty import TwentyClient, TwentyError  # noqa: E402



def compute(client: TwentyClient) -> dict[str, dict]:
    """Person id -> {hard_micros, first, last, gifts} from live Twenty Hard credits.

    Uses Twenty itself (not the Aplos export) so every gift in the CRM counts,
    whatever its source.
    """
    gift_date = {d["id"]: d.get("giftDate") for d in client.rest_get_all("donations")}
    rollups: dict[str, dict] = {}
    for c in client.rest_get_all("donationCredits"):
        pid, did = c.get("personId"), c.get("donationId")
        if not pid or did not in gift_date or c.get("creditType") != "HARD":
            continue
        date = gift_date[did]
        agg = rollups.setdefault(pid, {"hard_micros": 0, "first": date, "last": date, "gifts": 0})
        agg["hard_micros"] += (c.get("creditAmount") or {}).get("amountMicros") or 0
        agg["gifts"] += 1
        if date:
            if not agg["first"] or date < agg["first"]:
                agg["first"] = date
            if not agg["last"] or date > agg["last"]:
                agg["last"] = date
    return rollups


def main() -> int:
    apply = "--apply" in sys.argv[1:]
    client = TwentyClient()
    rollups = compute(client)
    people = {p["id"]: p for p in client.rest_get_all("people")}
    total = sum(a["hard_micros"] for a in rollups.values())
    print(f"Computed rollups for {len(rollups)} individual donors; "
          f"hard total ${micros_to_dollars(total)}")
    top = sorted(rollups.items(), key=lambda kv: kv[1]["hard_micros"], reverse=True)[:10]
    print("\nTop 10 by lifetime hard giving:")
    for pid, a in top:
        print(f"  {people.get(pid, {}).get('externalDonorId') or pid}: ${micros_to_dollars(a['hard_micros'])}  "
              f"({a['gifts']} gifts, {a['first']}–{a['last']})")

    changes = []
    for pid, a in rollups.items():
        cur = people.get(pid)
        if cur is None:
            continue
        payload = {
            "lifetimeHardGiving": money(micros_to_dollars(a["hard_micros"])),
            "firstGiftDate": a["first"],
            "lastGiftDate": a["last"],
        }
        same = (
            ((cur.get("lifetimeHardGiving") or {}).get("amountMicros") or 0) == a["hard_micros"]
            and cur.get("firstGiftDate") == a["first"]
            and cur.get("lastGiftDate") == a["last"]
        )
        if not same:
            changes.append((pid, payload))
    print(f"\n{len(changes)} people need updated rollups")

    if not apply:
        print("Dry-run only. Re-run with --apply to PATCH Person rollups.")
        return 0

    patched = failed = 0
    for pid, payload in changes:
        try:
            client.update("people", pid, payload)
            patched += 1
        except TwentyError as exc:
            print(f"  ! {pid}: {exc}", file=sys.stderr)
            failed += 1
        if patched % 100 == 0 and patched:
            print(f"  …{patched} patched", flush=True)
    print(f"\nRollups: {patched} patched, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
