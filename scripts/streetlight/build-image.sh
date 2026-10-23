#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
IMAGE_TAG="${1:-streetlight-crm:local}"
SOURCE_URL="${SOURCE_URL:-https://example.invalid/streetlight-crm}"

cd "${ROOT_DIR}"
docker build \
  --file packages/twenty-docker/twenty/Dockerfile \
  --target twenty \
  --build-arg APP_VERSION="streetlight-local" \
  --label "org.opencontainers.image.source=${SOURCE_URL}" \
  --label "org.opencontainers.image.title=Streetlight CRM" \
  --label "org.opencontainers.image.description=Streetlight CRM, built on Twenty" \
  --tag "${IMAGE_TAG}" \
  .
