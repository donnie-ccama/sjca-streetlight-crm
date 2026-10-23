#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
COMPOSE_FILE="${ROOT_DIR}/deploy/streetlight/compose.dev.yml"
NODE24="${ROOT_DIR}/scripts/streetlight/node24.sh"
NX_BIN="${ROOT_DIR}/node_modules/.bin/nx"
WAIT_ON_BIN="${ROOT_DIR}/node_modules/.bin/wait-on"
SERVER_DIR="${ROOT_DIR}/packages/twenty-server"

cd "${ROOT_DIR}"

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker Desktop first." >&2
  exit 1
fi

docker compose -f "${COMPOSE_FILE}" up -d --wait

# The upstream launcher starts two Nest watch compilers that both write the
# server dist tree. Build once and run the API and worker from that immutable
# output to avoid restart loops while retaining frontend hot reload.
export NX_DAEMON=false
export NX_NATIVE_COMMAND_RUNNER=false
export NX_TASKS_RUNNER_DYNAMIC_OUTPUT=false
"${NODE24}" corepack yarn nx build twenty-server --output-style=static

exec "${NODE24}" corepack yarn concurrently --kill-others \
  "\"${NX_BIN}\" run twenty-front:start" \
  "cd \"${SERVER_DIR}\" && NODE_ENV=development node --enable-source-maps dist/main.js" \
  "\"${WAIT_ON_BIN}\" tcp:3100 && cd \"${SERVER_DIR}\" && NODE_ENV=development node --enable-source-maps dist/queue-worker/queue-worker.js"
