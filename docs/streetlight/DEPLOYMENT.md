# Hosted deployment

## Recommended shape

Cloudflare is an excellent DNS, TLS, WAF, and object-storage edge for
Streetlight CRM, but Cloudflare Workers are not a direct host for the full
Twenty stack. Twenty needs a long-running Node server, a background worker,
PostgreSQL, Redis, and durable file storage.

Use this topology:

```text
Internet -> Cloudflare -> Caddy -> Streetlight server
                                  -> Streetlight worker
                                  -> managed PostgreSQL 16+
                                  -> managed Redis
                                  -> Cloudflare R2
```

A conventional Docker VM is the simplest first production target. A managed
container service is also suitable if it supports a continuously running web
service and worker. Keep PostgreSQL and Redis outside the application host for
production recovery and upgrades.

Cloudflare Containers are a supported managed-container option as of October
2026. Use [CLOUDFLARE_DEPLOYMENT.md](./CLOUDFLARE_DEPLOYMENT.md) for the
single-tenant account model, container lifecycle, cost gate, and acceptance
path.

## Build

Build one immutable image from the exact reviewed commit and run that same
image for both server and worker:

```bash
SOURCE_URL=https://git.example.org/your-org/streetlight-crm \
  ./scripts/streetlight/build-image.sh \
  registry.example.org/streetlight-crm:2.50.0-streetlight.1
```

Push the image to a private registry, record its digest, and set
`STREETLIGHT_IMAGE` to that digest in the host environment. The source URL must
be the no-charge Corresponding Source location required by the AGPL for the
running build.

## Configure

On the host:

1. Copy `deploy/streetlight/production.env.example` to
   `deploy/streetlight/production.env`.
2. Store high-entropy `APP_SECRET` and `ENCRYPTION_KEY` values in a secret
   manager. Back up the encryption key; losing it makes encrypted credentials
   unrecoverable.
3. Use dedicated TLS-enabled PostgreSQL and Redis credentials.
4. Create a private R2 bucket and a credential limited to that bucket.
5. Set `STREETLIGHT_DOMAIN` and configure Cloudflare DNS to the host.
6. Keep Cloudflare SSL/TLS mode at Full (strict).

Validate rendered configuration without starting services:

```bash
STREETLIGHT_IMAGE=registry.example.org/streetlight-crm@sha256:REPLACE \
STREETLIGHT_DOMAIN=crm.example.org \
docker compose -f deploy/streetlight/compose.prod.yml config
```

Start only after backups, restore ownership, DNS, and secrets are approved:

```bash
docker compose -f deploy/streetlight/compose.prod.yml up -d
```

## Acceptance gates

- server and worker run the same immutable image digest;
- `/healthz` is healthy through the public hostname;
- database migrations completed once, on the server;
- a backup can be restored into an isolated environment;
- R2 upload and download work through the application;
- invitation, login, password reset, and outbound email are verified;
- the Streetlight app plan and sync pass against a new workspace;
- a synthetic donation flows through acknowledgment, dashboard, and export;
- the running UI links prominently to the exact source for that build;
- logs, error reporting, retention, and incident ownership are documented.

Start with one workspace or instance per customer. Do not market the deployment
as multi-tenant isolation until cross-workspace authorization, backup, restore,
and deletion have been independently tested.
