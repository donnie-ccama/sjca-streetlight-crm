# SJCA deployment files

This folder holds files that belong only to the SJCA deployment of Streetlight CRM.
The setup matches the Citykid deployment: one server running Docker Compose, Supabase for PostgreSQL, Cloudflare R2 for files, a Cloudflare Tunnel for `sjca.dev`, and Google for sign-in, Gmail and Calendar.

Donor automations are on (`LOGIC_FUNCTION_TYPE=LOCAL`), as in Citykid. Daily entry, giving totals, dashboards and acknowledgment tasks depend on them.

## Files

- `deploy/compose.yml` runs the server, the worker, Redis and the tunnel.
- `deploy/sjca.env.example` lists every setting. Copy it to `deploy/sjca.env` and fill it in. Git ignores `sjca.env`.
- `deploy/check-env.sh` checks a filled-in `sjca.env` for missing or placeholder values. It prints key names, never values.
- `deploy/RUNBOOK.md` lists the live resources and the setup steps.

## Updates from streetlight-crm

SJCA does not merge `streetlight-crm` history. Use the sync script described in [SJCA_AUTOMATION.md](../docs/streetlight/SJCA_AUTOMATION.md).
Make shared changes in `streetlight-crm` first, then sync them here. Put SJCA-only files in this folder.

## Cloudflare Containers

The Cloudflare Containers path in [CLOUDFLARE_DEPLOYMENT.md](../docs/streetlight/CLOUDFLARE_DEPLOYMENT.md) is still available.
Its validator keeps automations off until an isolated `LAMBDA` runtime is set up, so it is not the configuration this folder describes.
