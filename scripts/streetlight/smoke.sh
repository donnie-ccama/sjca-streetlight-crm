#!/usr/bin/env bash
set -euo pipefail

SERVER_URL="${SERVER_URL:-http://localhost:3100}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3101}"

curl --fail --silent --show-error "${SERVER_URL}/healthz" >/dev/null
curl --fail --silent --show-error "${FRONTEND_URL}" >/dev/null

echo "Streetlight CRM server and frontend are responding."
