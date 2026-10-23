#!/usr/bin/env bash
set -euo pipefail

NODE_VERSION="24.16.0"

if command -v mise >/dev/null 2>&1; then
  exec mise exec "node@${NODE_VERSION}" -- "$@"
fi

if [[ "$(node --version 2>/dev/null || true)" == v24.* ]]; then
  exec "$@"
fi

echo "Node 24 is required. Install mise (recommended) or select Node ${NODE_VERSION}." >&2
exit 1
