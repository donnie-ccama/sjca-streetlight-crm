#!/usr/bin/env bash
# Usage: check-env.sh <env-file>
# Checks every key in sjca.env.example. Prints bad keys, never values.
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <env-file>" >&2
  exit 2
fi

ENV_FILE="$1"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXAMPLE="$HERE/sjca.env.example"

if [ ! -f "$ENV_FILE" ]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 2
fi

bad=0
while IFS= read -r key; do
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 || true)"
  if [ -z "$line" ]; then
    echo "MISSING $key"
    bad=1
    continue
  fi
  value="${line#*=}"
  value="${value%\"}"; value="${value#\"}"
  if [ -z "$value" ]; then
    echo "MISSING $key"
    bad=1
  elif [[ "$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')" == *replace* ]]; then
    echo "PLACEHOLDER $key"
    bad=1
  fi
done < <(grep -E '^[A-Z_][A-Z0-9_]*=' "$EXAMPLE" | cut -d= -f1)

if [ "$bad" -eq 1 ]; then
  exit 1
fi
echo "OK"
