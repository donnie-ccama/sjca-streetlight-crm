#!/usr/bin/env bash
set -euo pipefail

# Usage: selfhosted-backup.sh [backup-dir] [retention-days]
BACKUP_DIR="${1:-/srv/streetlight/backups}"
RETENTION_DAYS="${2:-14}"
PROJECT=streetlight-crm
STAMP="$(date +%Y%m%d-%H%M%S)"

umask 077
mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"
trap 'rm -f "${BACKUP_DIR}"/*-"${STAMP}".*.partial' EXIT

docker exec "${PROJECT}-db-1" \
  pg_dump -U streetlight -d streetlight --format=custom \
  > "${BACKUP_DIR}/db-${STAMP}.dump.partial"
mv "${BACKUP_DIR}/db-${STAMP}.dump.partial" "${BACKUP_DIR}/db-${STAMP}.dump"

docker run --rm --user "$(id -u):$(id -g)" \
  -v "${PROJECT}_streetlight-local-storage:/storage:ro" \
  -v "${BACKUP_DIR}:/backup" \
  alpine:3 sh -c "umask 077 && tar -czf /backup/storage-${STAMP}.tar.gz.partial -C /storage ."
mv "${BACKUP_DIR}/storage-${STAMP}.tar.gz.partial" "${BACKUP_DIR}/storage-${STAMP}.tar.gz"

find "${BACKUP_DIR}" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'storage-*.tar.gz' \) \
  -mtime "+${RETENTION_DAYS}" -delete

echo "Backup ${STAMP} written to ${BACKUP_DIR}"
