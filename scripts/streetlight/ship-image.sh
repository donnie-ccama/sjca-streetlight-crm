#!/usr/bin/env bash
set -euo pipefail

# Builds the image locally and streams it to a Docker host over SSH, so the
# host needs no registry access or build memory.
# Usage: ship-image.sh <ssh-target> [source-url]
SSH_TARGET="${1:?Usage: ship-image.sh user@host [source-url]}"
SOURCE_URL="${2:-$(git config --get remote.origin.url)}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"

cd "${ROOT_DIR}"
if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is dirty; commit first so the image maps to an exact source revision." >&2
  exit 1
fi

SOURCE_REVISION="$(git rev-parse --short=12 HEAD)"
IMAGE_TAG="streetlight-crm:${SOURCE_REVISION}"
APP_VERSION="$(sed -n "s/^export const TWENTY_CURRENT_VERSION = '\(.*\)'.*/\1/p" \
  packages/twenty-server/src/engine/core-modules/upgrade/constants/twenty-current-version.constant.ts)-streetlight.g${SOURCE_REVISION}" \
SOURCE_URL="${SOURCE_URL}" ./scripts/streetlight/build-image.sh "${IMAGE_TAG}"
docker save "${IMAGE_TAG}" | gzip -1 | ssh "${SSH_TARGET}" 'gunzip | docker load'

echo "Loaded ${IMAGE_TAG} on ${SSH_TARGET}. Set STREETLIGHT_IMAGE=${IMAGE_TAG} in selfhosted.env."
