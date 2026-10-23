#!/usr/bin/env python3
"""Export per-donor lines for every Aplos accounting contribution (read-only).

`individual_contributions` misses most gifts (2022-2025 almost entirely). The
accounting `contributions` list carries headers only; GET contributions/{id}
returns the donor lines. This walks every header in data/raw/contributions.json
and writes data/raw/contribution_lines.json.

Resumable: fetched details are cached in data/raw/_contribution_details.json,
so a re-run only fetches headers not yet cached.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.aplos import AplosClient, AplosError  # noqa: E402
from lib.env import PROJECT_ROOT  # noqa: E402

RAW = PROJECT_ROOT / "data" / "raw"
CACHE = RAW / "_contribution_details.json"
OUT = RAW / "contribution_lines.json"


def main() -> int:
    headers = json.loads((RAW / "contributions.json").read_text())
    cache: dict[str, dict] = json.loads(CACHE.read_text()) if CACHE.is_file() else {}
    client = AplosClient()
    todo = [h for h in headers if str(h["id"]) not in cache]
    print(f"{len(headers)} headers, {len(todo)} to fetch", flush=True)
    for i, h in enumerate(todo, 1):
        try:
            payload = client.get(f"contributions/{h['id']}")
        except AplosError as exc:
            print(f"  ! {h['id']}: {exc}", file=sys.stderr)
            CACHE.write_text(json.dumps(cache))
            return 1
        cache[str(h["id"])] = (payload.get("data") or {}).get("contribution") or {}
        if i % 100 == 0:
            CACHE.write_text(json.dumps(cache))
            print(f"  {i}/{len(todo)}", flush=True)
    CACHE.write_text(json.dumps(cache))

    lines = []
    for h in headers:
        detail = cache.get(str(h["id"])) or {}
        for ln in detail.get("lines") or []:
            lines.append({**ln, "date": detail.get("date") or h["date"]})
    OUT.write_text(json.dumps(lines, indent=2))
    print(f"{len(lines)} lines -> {OUT.relative_to(PROJECT_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
