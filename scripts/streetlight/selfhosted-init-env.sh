#!/usr/bin/env bash
set -euo pipefail

# Usage: selfhosted-init-env.sh <public-url> [env-file]
PUBLIC_URL="${1:?Usage: selfhosted-init-env.sh https://host.tailnet.ts.net [env-file]}"
ENV_FILE="${2:-$(dirname "$0")/../../deploy/streetlight/selfhosted.env}"
EXAMPLE_FILE="$(dirname "$0")/../../deploy/streetlight/selfhosted.env.example"

if [ -e "${ENV_FILE}" ]; then
  echo "${ENV_FILE} already exists; refusing to overwrite its secrets." >&2
  exit 1
fi

umask 077
sed \
  -e "s|^SERVER_URL=.*|SERVER_URL=${PUBLIC_URL}|" \
  -e "s|^FRONTEND_URL=.*|FRONTEND_URL=${PUBLIC_URL}|" \
  -e "s|^PG_DATABASE_PASSWORD=.*|PG_DATABASE_PASSWORD=$(openssl rand -hex 32)|" \
  -e "s|^APP_SECRET=.*|APP_SECRET=$(openssl rand -base64 32)|" \
  -e "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$(openssl rand -base64 32)|" \
  "${EXAMPLE_FILE}" > "${ENV_FILE}"

echo "Wrote ${ENV_FILE}. Set STREETLIGHT_IMAGE, then back up ENCRYPTION_KEY off the host."
