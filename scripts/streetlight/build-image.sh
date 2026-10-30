#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
IMAGE_TAG="${1:-streetlight-crm:local}"
SOURCE_URL="${SOURCE_URL:-https://example.invalid/streetlight-crm}"

cd "${ROOT_DIR}"
# The server rejects a non-semver APP_VERSION at startup.
TWENTY_VERSION="$(sed -n "s/^export const TWENTY_CURRENT_VERSION = '\(.*\)'.*/\1/p" \
  packages/twenty-server/src/engine/core-modules/upgrade/constants/twenty-current-version.constant.ts)"
APP_VERSION="${APP_VERSION:-${TWENTY_VERSION}-streetlight.local}"

docker build \
  --file packages/twenty-docker/twenty/Dockerfile \
  --target twenty \
  --build-arg APP_VERSION="${APP_VERSION}" \
  --label "org.opencontainers.image.source=${SOURCE_URL}" \
  --label "org.opencontainers.image.title=Streetlight CRM" \
  --label "org.opencontainers.image.description=Streetlight CRM, built on Twenty" \
  --tag "${IMAGE_TAG}" \
  .
