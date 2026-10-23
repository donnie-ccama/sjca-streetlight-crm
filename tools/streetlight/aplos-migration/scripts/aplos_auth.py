#!/usr/bin/env python3
"""Prove Aplos auth: fetch/reuse a token and confirm a read works. No token is printed.

Usage:
  python3 scripts/aplos_auth.py          # use cached token if fresh, else fetch
  python3 scripts/aplos_auth.py --force  # force a new token (use sparingly: lockout risk)
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.aplos import AplosClient, AplosError  # noqa: E402


def mask(token: str) -> str:
    if len(token) <= 8:
        return "*" * len(token)
    return f"{token[:4]}…{token[-4:]} (len {len(token)})"


def main() -> int:
    force = "--force" in sys.argv[1:]
    client = AplosClient()
    print(f"Client ID: {client.client_id}")
    print(f"Key path : {client.key_path}")
    print(f"Account  : {client.account_id or '(none set)'}")
    try:
        token = client.get_token(force=force)
        print(f"Token OK : {mask(token)}")
        # One light read to confirm the bearer token is accepted.
        payload = client.get("contacts", {"page_size": 1})
        meta = payload.get("meta") or {}
        status = payload.get("status")
        print(f"Read OK  : GET /contacts status={status} meta={meta}")
    except AplosError as exc:
        print(f"FAILED   : {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
