#!/usr/bin/env python3
"""Export Aplos contact detail (addresses, phones) for donor contacts (read-only).

The contacts list omits addresses and phones; GET contacts/{id} includes them.
Scope: contacts that appear on any gift line (individual_contributions or
contribution_lines). Writes data/raw/contact_details.json keyed by contact id.
Resumable: re-runs fetch only ids not yet saved.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.aplos import AplosClient, AplosError  # noqa: E402
from lib.env import PROJECT_ROOT  # noqa: E402

RAW = PROJECT_ROOT / "data" / "raw"
OUT = RAW / "contact_details.json"


def donor_ids() -> set[int]:
    ids: set[int] = set()
    for name in ("individual_contributions", "contribution_lines"):
        path = RAW / f"{name}.json"
        if path.is_file():
            for r in json.loads(path.read_text()):
                cid = (r.get("contact") or {}).get("id")
                if cid is not None:
                    ids.add(cid)
    return ids


def main() -> int:
    saved: dict[str, dict] = json.loads(OUT.read_text()) if OUT.is_file() else {}
    todo = sorted(i for i in donor_ids() if str(i) not in saved)
    print(f"{len(saved)} saved, {len(todo)} to fetch", flush=True)
    client = AplosClient()
    for n, cid in enumerate(todo, 1):
        try:
            payload = client.get(f"contacts/{cid}")
        except AplosError as exc:
            print(f"  ! {cid}: {exc}", file=sys.stderr)
            OUT.write_text(json.dumps(saved))
            return 1
        data = payload.get("data") or {}
        saved[str(cid)] = data.get("contact", data)
        if n % 100 == 0:
            OUT.write_text(json.dumps(saved))
            print(f"  {n}/{len(todo)}", flush=True)
    OUT.write_text(json.dumps(saved))
    print(f"{len(saved)} contacts -> {OUT.relative_to(PROJECT_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
