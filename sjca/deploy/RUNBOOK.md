# SJCA CRM runbook

This file lists the live resources by name. It holds no secrets. Keep the secrets in the password manager.
Fill in each `TODO` when the resource exists.

## DNS

- Domain: `sjca.dev`. DNS host: Cloudflare, account "San Jacinto Christian Academy".
- `sjca.dev` is the Cloudflare Tunnel route.

## Cloudflare

- R2 bucket: `sjca-crm-files` (private). The R2 API token has access to this bucket only.
- Tunnel: `sjca-crm`. Public hostname `sjca.dev` to `http://server:3000`.
- The tunnel connector runs only on the server, in the `cloudflared` service of `sjca/deploy/compose.yml`.

## Supabase

- Project: `sjca-crm`. TODO: plan and region.
- The CRM uses the session pooler on port `5432`. Do not use the direct host, because it is IPv6 only.

## Google

- Google Cloud project: `sjca-crm`. TODO: organization and owner.
- APIs on: Gmail API, Google Calendar API, People API.
- OAuth consent screen: Internal, app name "Streetlight CRM", authorized domain `sjca.dev`.
- OAuth client: `sjca-crm-web`, type Web application. Redirect URIs:
  - `https://sjca.dev/auth/google/redirect`
  - `https://sjca.dev/auth/google-apis/get-access-token`
- The client ID and secret go in `AUTH_GOOGLE_CLIENT_ID` and `AUTH_GOOGLE_CLIENT_SECRET`.
- Outgoing email: SMTP through `smtp.gmail.com:465` as `crm@sjca.dev`. Put the sending account in `EMAIL_SMTP_USER` and its App Password in `EMAIL_SMTP_PASSWORD`.

## Server

- TODO: host, size, region and IP.
- Allow inbound SSH from trusted addresses only. The tunnel needs no other inbound port.
- The repo goes at `/srv/sjca/app`. The env file goes at `/srv/sjca/app/sjca/deploy/sjca.env`. Git ignores it.

## Start or update

```bash
cd /srv/sjca/app/sjca/deploy
bash check-env.sh sjca.env
docker compose --env-file sjca.env up -d
```

Build and publish the image with `scripts/streetlight/build-image.sh` and `scripts/streetlight/ship-image.sh`, then set `STREETLIGHT_IMAGE` to that tag.

## Install the Streetlight app

The donor fields and automations live in the Streetlight app. Install or update it in the workspace with the steps in [APP_INSTALLATION.md](../../docs/streetlight/APP_INSTALLATION.md).

## Admin panel

The admin panel is on for any user who has server admin access.
The first person to create the workspace gets server admin access automatically.
To see it, sign in as that person and open Settings, then Admin Panel.
From there a server admin can give admin access to another user.
