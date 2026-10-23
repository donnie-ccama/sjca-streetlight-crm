# Single-tenant Cloudflare runtime

Each deployment routes one organization's Streetlight CRM to two Cloudflare
Containers built from the repository's production image:

- a `standard-1` web container on port 3000; and
- a `standard-1` queue-worker container.

A five-minute Cron Trigger re-arms the inactivity timeout and restarts either
role after a Cloudflare host event. A changed image or runtime configuration
replaces the affected running container on the next request or scheduled check.
PostgreSQL, Redis, email, and R2 remain managed services outside the
containers. Container disks are replaceable and hold no authoritative data.

The deploy wrapper requires an explicit tenant, binds Wrangler to that tenant's
Cloudflare account, disables `workers.dev`, creates the selected custom-domain
route, and pins the image to a publicly reachable source revision. Production
logic functions require the isolated Lambda mode described in the runbook.
Unsandboxed local execution is rejected.

See [the deployment runbook](../../docs/streetlight/CLOUDFLARE_DEPLOYMENT.md)
before using `yarn deploy --tenant=sjca`.
