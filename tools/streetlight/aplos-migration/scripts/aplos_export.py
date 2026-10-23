#!/usr/bin/env python3
"""Export Aplos source data (read-only) to data/raw/<endpoint>.json.

Persists raw API responses verbatim so transform/import can re-run without
re-hitting Aplos (audit trail + lockout safety).

Usage:
  python3 scripts/aplos_export.py --peek   # fetch 1 record per endpoint, print shapes, no full write
  python3 scripts/aplos_export.py          # full paginated export to data/raw/
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.aplos import AplosClient, AplosError  # noqa: E402
from lib.env import PROJECT_ROOT  # noqa: E402

RAW_DIR = PROJECT_ROOT / "data" / "raw"

# Endpoints to export. Order is informational; each is independent.
#   contacts                  full contact universe (email/type/timestamps; names unreliable)
#   contributions             gift headers (no line detail) — kept for audit/reconciliation
#   individual_contributions  pre-exploded per-donor gift lines — the authoritative import source
#   purposes                  giving designations -> Twenty Fund
#   tags                      segmentation labels  (Aplos endpoint is /tags, not /accounting_tags)
# (No /partners endpoint exists in this Aplos org — omitted.)
ENDPOINTS = [
    "contacts",
    "contributions",
    "individual_contributions",
    "purposes",
    "tags",
]


def _records(payload: dict) -> list:
    data = payload.get("data")
    if isinstance(data, dict):
        return next((v for v in data.values() if isinstance(v, list)), [])
    if isinstance(data, list):
        return data
    return []


def peek(client: AplosClient) -> int:
    for ep in ENDPOINTS:
        try:
            payload = client.get(ep, {"page_size": 1})
        except AplosError as exc:
            print(f"\n### {ep}: ERROR {exc}")
            continue
        records = _records(payload)
        meta = payload.get("meta") or {}
        count = meta.get("resource_count", "?")
        print(f"\n### {ep}  (status={payload.get('status')}, resource_count={count})")
        if records:
            sample = records[0]
            keys = sorted(sample.keys()) if isinstance(sample, dict) else type(sample).__name__
            print(f"top-level keys: {keys}")
            print(json.dumps(sample, indent=2)[:2000])
        else:
            print(f"no records; data type={type(payload.get('data')).__name__}")
    return 0


def full_export(client: AplosClient) -> int:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    summary: dict[str, int] = {}
    for ep in ENDPOINTS:
        print(f"Exporting {ep} …", flush=True)
        try:
            records = list(client.paginate(ep, page_size=500))
        except AplosError as exc:
            print(f"  ! {ep} failed: {exc}", file=sys.stderr)
            return 1
        out = RAW_DIR / f"{ep}.json"
        out.write_text(json.dumps(records, indent=2))
        summary[ep] = len(records)
        print(f"  {ep}: {len(records)} records -> {out.relative_to(PROJECT_ROOT)}")
    print("\n=== Export summary ===")
    for ep, n in summary.items():
        print(f"  {ep}: {n}")
    (RAW_DIR / "_summary.json").write_text(json.dumps(summary, indent=2))
    return 0


def main() -> int:
    client = AplosClient()
    if "--peek" in sys.argv[1:]:
        return peek(client)
    return full_export(client)


if __name__ == "__main__":
    raise SystemExit(main())
