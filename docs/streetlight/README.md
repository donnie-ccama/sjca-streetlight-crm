# Streetlight CRM

Streetlight CRM is an SJCA-specific public CRM distribution built on the Twenty
core and a separate Streetlight donor-operations application. This repository
is the independently versioned source for the deployment at
`https://sjca.dev`.

## Repository baseline

- Twenty release: `twenty/v2.50.0`
- Upstream commit: `540c10e07617fef73d5fb56e04e1c93d7e79cb06`
- Runtime: Node 24.16.0 and Yarn 4.13.0
- Local services: PostgreSQL 16 on `127.0.0.1:56432`; Redis 7 on
  `127.0.0.1:57379`
- Local application: frontend on `http://localhost:3101`; API on
  `http://localhost:3100`

The donor application lives at
`packages/twenty-apps/public/streetlight-crm`. It owns its donor objects and
relationships, so a fresh workspace no longer depends on metadata from the old
hosted tenant.

## Start here

1. Read [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md).
2. Read [DATA_SAFETY.md](./DATA_SAFETY.md) before importing any customer data.
3. Use [DEPLOYMENT.md](./DEPLOYMENT.md) to prepare a hosted environment.
   For a Cloudflare Containers deployment, use
   [CLOUDFLARE_DEPLOYMENT.md](./CLOUDFLARE_DEPLOYMENT.md).
4. Use [APP_INSTALLATION.md](./APP_INSTALLATION.md) to plan and install the
   Streetlight app into a workspace.
5. Read [LICENSING_AND_MARKETING.md](./LICENSING_AND_MARKETING.md) before
   publishing source, changing product branding, or selling the service.
6. Use [RUFLO.md](./RUFLO.md) for coordinated multi-agent development.
7. Review [SECURITY.md](./SECURITY.md) before building a production image.

No donor exports, credentials, tenant snapshots, migration output, or runtime
databases were copied into this repository.
