"""Shared env loader for the Aplos → Twenty migration.

Reads the Twenty workspace .env (../.env, source of TWENTY_* vars) first, then a
local ./.env in this project (Aplos vars + run params), with local taking
precedence. No third-party deps — mirrors provision-schema.py's loader.
"""

from __future__ import annotations

from pathlib import Path

# .../aplos-migration/lib/env.py -> parents[1] = aplos-migration, parents[2] = Twenty root
PROJECT_ROOT = Path(__file__).resolve().parents[1]
TWENTY_ROOT = Path(__file__).resolve().parents[2]

TWENTY_ENV = TWENTY_ROOT / ".env"
LOCAL_ENV = PROJECT_ROOT / ".env"


def _parse(path: Path, into: dict[str, str]) -> None:
    if not path.is_file():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        into[key.strip()] = value.strip().strip('"').strip("'")


def load_env() -> dict[str, str]:
    """Twenty root .env then local .env (local overrides)."""
    env: dict[str, str] = {}
    _parse(TWENTY_ENV, env)
    _parse(LOCAL_ENV, env)
    return env


def require(env: dict[str, str], *keys: str) -> None:
    """Exit-style guard: raise if any key is missing/empty."""
    missing = [k for k in keys if not env.get(k)]
    if missing:
        raise SystemExit(
            "Missing required env vars: "
            + ", ".join(missing)
            + f"\n  Twenty .env: {TWENTY_ENV}\n  local .env:  {LOCAL_ENV}"
        )
