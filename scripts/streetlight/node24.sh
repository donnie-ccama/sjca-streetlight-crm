#!/usr/bin/env bash
set -euo pipefail

NODE_VERSION="24.16.0"

if command -v mise >/dev/null 2>&1; then
  exec mise exec "node@${NODE_VERSION}" -- "$@"
fi

if [[ "$(node --version 2>/dev/null || true)" == v24.* ]]; then
  exec "$@"
fi

for nvm_script in "${NVM_DIR:-$HOME/.nvm}/nvm.sh" /opt/homebrew/opt/nvm/nvm.sh /usr/local/opt/nvm/nvm.sh; do
  if [[ -s "${nvm_script}" ]]; then
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    # shellcheck disable=SC1090
    . "${nvm_script}"
    if nvm use "${NODE_VERSION}" >/dev/null 2>&1; then
      exec "$@"
    fi
  fi
done

echo "Node 24 is required. Install mise or nvm, then install Node ${NODE_VERSION}." >&2
exit 1
