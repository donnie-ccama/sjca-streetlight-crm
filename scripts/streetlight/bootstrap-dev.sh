#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
SERVER_ENV="${ROOT_DIR}/packages/twenty-server/.env"
FRONT_ENV="${ROOT_DIR}/packages/twenty-front/.env"
DEV_ENV_TEMPLATE="${ROOT_DIR}/deploy/streetlight/development.env.example"
COMPOSE_FILE="${ROOT_DIR}/deploy/streetlight/compose.dev.yml"
NODE24="${ROOT_DIR}/scripts/streetlight/node24.sh"

cd "${ROOT_DIR}"

if ! docker info >/dev/null 2>&1; then
  echo "Docker is installed but its daemon is not running. Start Docker Desktop and rerun this command." >&2
  exit 1
fi

if [[ ! -f "${SERVER_ENV}" ]]; then
  cp "${DEV_ENV_TEMPLATE}" "${SERVER_ENV}"
  echo "Created ignored local server environment: ${SERVER_ENV}"
fi

if [[ ! -f "${FRONT_ENV}" ]]; then
  cp "${ROOT_DIR}/deploy/streetlight/frontend.env.example" "${FRONT_ENV}"
  echo "Created ignored local frontend environment: ${FRONT_ENV}"
fi

docker compose -f "${COMPOSE_FILE}" up -d --wait
"${NODE24}" corepack yarn install --immutable
env NX_DAEMON=false NX_NATIVE_COMMAND_RUNNER=false \
  NX_TASKS_RUNNER_DYNAMIC_OUTPUT=false \
  "${NODE24}" corepack yarn nx database:init twenty-server --output-style=static

echo "Streetlight CRM development dependencies and database are ready."
echo "Run: corepack yarn streetlight:dev"
