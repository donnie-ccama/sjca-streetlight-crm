# Self-hosted deployment (single host, tailnet only)

This variant runs the whole stack on one machine, reachable only from a
Tailscale network. PostgreSQL, Redis, and file storage live on the host
instead of in managed services. For the internet-facing shape, see
[DEPLOYMENT.md](DEPLOYMENT.md).

```text
tailnet device -> tailscale serve (HTTPS :443) -> 127.0.0.1:3000 server
                                                  worker
                                                  postgres:16, redis:7
                                                  local file storage volume
```

## Host prerequisites

- Ubuntu 24.04+ with Docker Engine and the Compose plugin
- Tailscale with HTTPS certificates enabled on the tailnet
- `/srv/streetlight` owned by the deploy user, who is in the `docker` group

## Build and ship the image

The frontend build needs about 8 GB of Node heap, so build on a workstation
and stream the image to the host:

```bash
./scripts/streetlight/ship-image.sh donnie@streetlight.example.ts.net
```

The image tag is the 12-character commit SHA. The script refuses a dirty tree.

## First install on the host

```bash
git clone <repo> /srv/streetlight/app && cd /srv/streetlight/app
./scripts/streetlight/selfhosted-init-env.sh https://streetlight.example.ts.net
# edit deploy/streetlight/selfhosted.env: set STREETLIGHT_IMAGE

cd deploy/streetlight
docker compose --env-file selfhosted.env -f compose.selfhosted.yml up -d --wait

sudo tailscale serve --bg --https=443 http://127.0.0.1:3000
```

Copy `ENCRYPTION_KEY` and the whole `selfhosted.env` to a password manager.
Without them, a backup restores data but not the stored integration
credentials.

## Backups

```bash
mkdir -p ~/.config/systemd/user
cp deploy/streetlight/systemd/streetlight-backup.* ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now streetlight-backup.timer
loginctl enable-linger "$USER"
```

Nightly at 02:30 this writes `db-*.dump` (pg_dump custom format) and
`storage-*.tar.gz` to `/srv/streetlight/backups`, keeping 14 days. These
copies are on the same disk; copy them off the host as well.

Restore into a stopped stack, from `deploy/streetlight`. This replaces the
current database and file storage with the backup:

```bash
BACKUPS=/srv/streetlight/backups STAMP=20260101-023000
docker compose --env-file selfhosted.env -f compose.selfhosted.yml stop server worker
docker exec -i streetlight-crm-db-1 pg_restore -U streetlight -d streetlight --clean --if-exists \
  < "${BACKUPS}/db-${STAMP}.dump"
docker run --rm --user "$(id -u):$(id -g)" \
  -v streetlight-crm_streetlight-local-storage:/storage -v "${BACKUPS}":/backup:ro alpine:3 \
  sh -c "find /storage -mindepth 1 -delete && tar -xzf /backup/storage-${STAMP}.tar.gz -C /storage"
docker compose --env-file selfhosted.env -f compose.selfhosted.yml start server worker
```

## Upgrade

```bash
./scripts/streetlight/ship-image.sh donnie@streetlight.example.ts.net   # on the workstation
# on the host: back up, set the new STREETLIGHT_IMAGE, then
docker compose --env-file selfhosted.env -f compose.selfhosted.yml up -d --wait
```

The server runs migrations on start; the worker waits for it to be healthy.
