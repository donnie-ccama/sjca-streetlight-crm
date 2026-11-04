# SJCA CRM runbook

This file lists the live resources by name. It holds no secrets. Keep the secrets in the password manager.

## DNS

- Domain: `sjca.dev`. DNS host: Cloudflare, account "San Jacinto Christian Academy".
- `sjca.dev` is a proxied CNAME to `5e7202e9-717d-4160-a63d-805f348f283e.cfargotunnel.com`, the `sjca-crm` tunnel.
- The Cloudflare Worker `sjca-streetlight-crm` no longer owns `sjca.dev`. Do not add it back as a Worker custom domain, because a Worker domain takes traffic before the tunnel.

## Cloudflare

- R2 bucket: `sjca-streetlight-crm` (private). The R2 API token has access to this bucket only.
- Tunnel: `sjca-crm`, id `5e7202e9-717d-4160-a63d-805f348f283e`. Route type "Published application", hostname `sjca.dev`, service `http://server:3000`.
- Tunnels live at `dash.cloudflare.com/<account>/tunnels`. When you add a route, pick "Published application", not "Private hostname".
- The tunnel connector runs only on the droplet, in the `cloudflared` service of `sjca/deploy/compose.yml`. Its token is `TUNNEL_TOKEN` in `sjca.env`.
- The old Cloudflare Containers deployment (Worker `sjca-streetlight-crm` and two containers) still exists in the account until someone deletes it. It serves nothing now.

## PostgreSQL

- Provider: Render, database `sjca_streetlight_postgres`, region Oregon.
- The droplet and the old Cloudflare instance use the same database, so the data did not move.
- Render refuses connections from outside its allow list. Use the app, the API, or the Render dashboard to look at data.

## Google

- Google sign-in is off (`AUTH_GOOGLE_ENABLED=false`). Users sign in with email and password.
- To turn it on, create the OAuth client `sjca-crm-web` (type Web application) in a Google Cloud project with these redirect URIs:
  - `https://sjca.dev/auth/google/redirect`
  - `https://sjca.dev/auth/google-apis/get-access-token`
- Then set `AUTH_GOOGLE_ENABLED=true`, `AUTH_GOOGLE_CLIENT_ID` and `AUTH_GOOGLE_CLIENT_SECRET` in `sjca.env` and restart.
- Outgoing email: SMTP as `crm@sjca.dev`. The host, port, user and password are in `sjca.env`.

## DigitalOcean

- Droplet: `sjca-crm-fw`, Ubuntu 24.04, 4 GB / 2 vCPU.
- IP: `201.79.35.249`.
- Firewall: inbound SSH from Donnie's home IP only. No other inbound. The tunnel makes outbound connections only.
- If Donnie's home IP changes, update the SSH source in the firewall.

## Droplet layout

- User `deploy` is in group `docker`. Log in with `ssh deploy@201.79.35.249`.
- `/srv/sjca` belongs to `deploy`.
- The repo is at `/srv/sjca/app`, cloned from the public GitHub repo over HTTPS. No deploy key is needed.
- The env file is at `/srv/sjca/app/sjca/deploy/sjca.env`, mode 600. Git ignores it.
- Docker and Docker Compose come from the Ubuntu packages `docker.io` and `docker-compose-v2`.

## Deploy and upgrade

The image tag is `streetlight-crm:<12-character commit sha>` of `main`. Build on the Mac, never on the droplet.

1. Make sure `main` is merged. Note the commit: `SHA=$(git rev-parse HEAD)` and `SHORT=$(git rev-parse --short=12 HEAD)`.
2. Build the front end on the Mac and stamp it. The Dockerfile refuses a stale host build without this stamp:

   ```bash
   npx nx build twenty-front --skip-nx-cache
   git rev-parse HEAD > packages/twenty-front/build/.source-revision
   ```

3. Build the image for `linux/amd64`. This takes a long time the first time:

   ```bash
   docker build --platform linux/amd64 \
     --file packages/twenty-docker/twenty/Dockerfile --target twenty \
     --build-arg APP_VERSION="2.50.0-streetlight.g$SHORT" \
     --build-arg SOURCE_REVISION="$SHA" \
     --build-arg SOURCE_URL="https://github.com/donnie-ccama/sjca-streetlight-crm/commit/$SHA" \
     --tag "streetlight-crm:$SHORT" .
   ```

   `scripts/streetlight/ship-image.sh` does the same build and ship, but it refuses a tree with untracked files.

4. Ship the image to the droplet:

   ```bash
   docker save "streetlight-crm:$SHORT" | gzip -1 | ssh deploy@201.79.35.249 'gunzip | docker load'
   ```

5. On the droplet, move the repo to the same commit, point the env at the new tag, and restart:

   ```bash
   ssh deploy@201.79.35.249 "cd /srv/sjca/app && git fetch origin && git checkout -q $SHA"
   ssh deploy@201.79.35.249 "sed -i 's/^STREETLIGHT_IMAGE=.*/STREETLIGHT_IMAGE=streetlight-crm:$SHORT/' /srv/sjca/app/sjca/deploy/sjca.env"
   ssh deploy@201.79.35.249 'cd /srv/sjca/app/sjca/deploy && docker compose --env-file sjca.env up -d --wait'
   ```

6. Check from the Mac: `curl https://sjca.dev/healthz` returns `{"status":"ok",...}`.
7. Roll back: set `STREETLIGHT_IMAGE` to the previous tag and run the compose command again. Old images stay on the droplet until `docker image prune`.

Deploy log:

- 2026-11-04: `streetlight-crm:b14f9b08442c`, first boot on the droplet. Moved from Cloudflare Containers so logic functions run (`LOGIC_FUNCTION_TYPE=LOCAL`).

## Install or update the Streetlight app

The donor fields, sidebar items and automations live in the Streetlight app. Install or update it with the steps in [APP_INSTALLATION.md](../../docs/streetlight/APP_INSTALLATION.md).

The Twenty CLI picks its target from `~/.twenty/config.json`, not from the app `.env`, and its default remote is `citykid-crm`. Always pass the SJCA remote:

```bash
cd packages/twenty-apps/public/streetlight-crm
yarn twenty plan -r sjca
yarn twenty apply -r sjca --no-delete
```

The `sjca` remote holds a workspace API key. Create a new key in `sjca.dev` under Settings, Developers, when it expires, and update the remote with `yarn twenty remote:add --as sjca --url https://sjca.dev`.

## Admin panel

The admin panel is on for any user who has server admin access.
The first person to create the workspace gets server admin access automatically.
To see it, sign in as that person and open Settings, then Admin Panel.
From there a server admin can give admin access to another user.
