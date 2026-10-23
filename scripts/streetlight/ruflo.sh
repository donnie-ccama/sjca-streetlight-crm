#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
CONFIG_FILE="${ROOT_DIR}/config/ruflo/project.json"

read_config() {
  node -e "const value = require(process.argv[1]); console.log(process.argv.slice(2).reduce((current, key) => current[key], value));" "${CONFIG_FILE}" "$@"
}

RUFLO_VERSION="$(read_config rufloVersion)"
POLICY_MODE="$(read_config policyMode)"
TOPOLOGY="$(read_config swarm topology)"
STRATEGY="$(read_config swarm strategy)"
MAX_AGENTS="$(read_config swarm maxAgents)"
RUFLO=(npx --yes "ruflo@${RUFLO_VERSION}")

cd "${ROOT_DIR}"

case "${1:-status}" in
  setup)
    if [[ ! -t 0 || ! -t 1 ]]; then
      echo "Ruflo policy setup requires an interactive local terminal." >&2
      exit 1
    fi

    "${RUFLO[@]}" policy verify --establish-anchor --project-root "${ROOT_DIR}"
    "${RUFLO[@]}" policy init --mode "${POLICY_MODE}" --project-root "${ROOT_DIR}"
    "${RUFLO[@]}" policy verify --full --project-root "${ROOT_DIR}"
    "${RUFLO[@]}" memory init
    "${RUFLO[@]}" swarm init \
      --topology "${TOPOLOGY}" \
      --strategy "${STRATEGY}" \
      --max-agents "${MAX_AGENTS}"
    "${RUFLO[@]}" hooks pretrain \
      --path "${ROOT_DIR}" \
      --depth shallow \
      --file-types ts,tsx,py,md,json
    "${RUFLO[@]}" hooks build-agents \
      --focus all \
      --output "${ROOT_DIR}/.claude-flow/agents" \
      --config-format yaml
    ;;
  status)
    "${RUFLO[@]}" policy status --project-root "${ROOT_DIR}"
    "${RUFLO[@]}" policy verify --full --project-root "${ROOT_DIR}"
    "${RUFLO[@]}" swarm status
    "${RUFLO[@]}" memory peek
    ;;
  route)
    shift
    if [[ "${1:-}" == "--" ]]; then
      shift
    fi
    if [[ "$#" -eq 0 ]]; then
      echo 'Usage: corepack yarn streetlight:ruflo:route -- "task description"' >&2
      exit 2
    fi
    "${RUFLO[@]}" hooks route --task "$*"
    ;;
  start)
    shift
    if [[ "${1:-}" == "--" ]]; then
      shift
    fi
    if [[ "$#" -eq 0 ]]; then
      echo 'Usage: corepack yarn streetlight:ruflo:start -- "task description"' >&2
      exit 2
    fi
    "${RUFLO[@]}" hooks route --task "$*"
    "${RUFLO[@]}" hooks pre-task --description "$*"
    ;;
  finish)
    shift
    if [[ "${1:-}" == "--" ]]; then
      shift
    fi
    if [[ "$#" -ne 2 ]]; then
      echo 'Usage: corepack yarn streetlight:ruflo:finish -- TASK_ID "task description"' >&2
      exit 2
    fi
    "${RUFLO[@]}" hooks post-task \
      --task-id "$1" \
      --success true \
      --quality 0.95 \
      --task "$2" \
      --agent coordinator \
      --agent-role coordinator \
      --store-results
    ;;
  *)
    echo "Unknown Ruflo action: $1" >&2
    exit 2
    ;;
esac
