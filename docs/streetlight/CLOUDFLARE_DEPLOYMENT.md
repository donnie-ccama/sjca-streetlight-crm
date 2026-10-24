# Cloudflare Containers deployment

This package prepares one dedicated Streetlight CRM instance per organization
and Cloudflare account. SJCA deploys first; Citykid and Streetlight follow only
after the SJCA acceptance gates pass. Twenty still requires external PostgreSQL
and Redis-compatible services because Cloudflare D1 is SQLite-compatible.

## Architecture

```text
Browser -> Cloudflare Worker -> web Container -> managed PostgreSQL
                                           \-> managed Redis
                                           \-> private Cloudflare R2 bucket

Cloudflare Cron Trigger -> queue-worker Container -> the same managed services
```

Each account contains one Worker with one named Durable Object for each role.
Both roles run the same
immutable production image. The web role runs migrations and cron
registration; the queue worker does neither. A five-minute scheduled check
re-arms each six-hour inactivity timeout and restarts containers after platform
host events. It starts and verifies the web role before the queue worker. The
same check replaces a running container when the deployed
image or hashed runtime configuration changes. No customer data belongs on a
container's replaceable disk.

## Cost gate

Cloudflare Containers require the Workers Paid plan. The configured
two `standard-1` containers reserve 8 GiB of memory and 16 GB of disk while
running. At Cloudflare's October 5, 2026 rates and a 730-hour month, the Workers
plan, provisioned memory, and disk are about $60 per month before active CPU,
Worker and Durable Object usage, logs, network
egress, R2, PostgreSQL, two Redis endpoints, email, backups, and the isolated
logic-function runtime. Fully active provisioned CPU would add roughly $52 per
month after the included allowance. Three separate accounts running this shape
continuously are about $181 per month before those additional services.

Re-check the displayed plan and provider prices immediately before enabling or
creating billable resources. Do not deploy until the account owner approves
the complete monthly estimate.

Cloudflare references:

- [Containers pricing](https://developers.cloudflare.com/containers/platform/pricing/)
- [Container limits and instance types](https://developers.cloudflare.com/containers/platform/limits/)
- [Container lifecycle](https://developers.cloudflare.com/containers/faq/)

## SJCA target state

Verified October 23, 2026:

- the authenticated Cloudflare identity is `donnie@citykid.me`;
- the account is named `San Jacinto Christian Academy` and contains only the
  active `sjca.dev` zone;
- `sjca.dev` has no conflicting DNS record;
- the account remains on Workers Free, R2 is disabled, and there are no Worker
  scripts, Worker domains, or Container applications;
- account-wide two-factor authentication enforcement is disabled; enable it
  only after confirming every administrator is enrolled; and
- the local Wrangler CLI is not authenticated. Use an account-scoped,
  least-privilege deployment identity bound to the manifest account rather than
  an ambient personal session.

Do not treat this snapshot as deployment acceptance. Re-run the checks before
each production mutation.

## Prerequisites

- Each organization has its own Cloudflare account, Workers Paid plan, zone,
  Worker, Durable Objects, R2 bucket, credentials, budgets, and incident owner.
  The deployment manifest pins the expected account and zone identifiers.
- Production deployment uses a short-lived or account-owned
  `CLOUDFLARE_API_TOKEN` scoped to the intended account, Worker, Containers,
  zone, and DNS reads. Never place the token in the repository, manifest,
  command line, or runtime environment secret.
- The final hostname belongs to the pinned zone and has no conflicting DNS
  record. Keep `SERVER_URL` and `FRONTEND_URL`
  identical HTTPS origins without paths.
- PostgreSQL 16 or newer uses a dedicated user, TLS, automated backups, and a
  tested isolated restore.
- Cache Redis and a dedicated queue Redis endpoint use TLS and authentication.
  The queue endpoint uses a `noeviction` policy and a unique
  `REDIS_QUEUE_PREFIX`; `REDIS_CACHE_PREFIX` alone does not isolate BullMQ
  queues. Both services have persistence appropriate to the provider and a
  documented recovery owner.
- R2 is enabled, a private `<tenant>-streetlight-crm` bucket exists, and its S3
  credential is restricted to that bucket.
- SMTP credentials and a verified sender are ready.
- The exact reviewed source revision has a public, no-charge AGPL Corresponding
  Source URL pinned to its 40-character commit SHA. The deploy wrapper checks
  that the URL is reachable and records it on the image.

### Logic-function isolation gate

Streetlight's donor workflows require Twenty logic functions. Do not use
`LOGIC_FUNCTION_TYPE=LOCAL` with production donor data: the local child process
inherits the server's PostgreSQL, Redis, R2, SMTP, application, and encryption
secrets. The deployment validator rejects `LOCAL`.

The example safely uses `DISABLED`, which is suitable only for infrastructure
bring-up because donor entry, rollups, dashboards, and acknowledgments will not
be complete. Before application acceptance, configure `LAMBDA` with a dedicated
AWS account or similarly isolated trust boundary and add the required
`LOGIC_FUNCTION_LAMBDA_*` values to `runtime-env.json`. Include Lambda, S3, IAM,
logging, and recovery costs in the approval gate.

## Prepare the runtime secret

For SJCA, from `packages/streetlight-cloudflare`:

```bash
cp tenants/sjca/runtime-env.example.json tenants/sjca/runtime-env.json
cp tenants/sjca/deployment.example.json tenants/sjca/deployment.json
```

Replace every example value. Generate independent values for `APP_SECRET` and
`ENCRYPTION_KEY`, then store both in the organization's secret manager. The
local tenant configuration files are ignored by Git. Set `deployment.json` to
the verified account, zone, final hostname, and publicly reachable,
revision-pinned Corresponding Source URL.

Commit and review the deployment changes before deploying. The wrapper rejects
a dirty worktree and requires `sourceUrl` to be the current origin repository's
public commit page for exactly `git rev-parse HEAD`; this binds the image labels,
the public `/source` redirect, the `/.well-known/streetlight-source` metadata,
and rollback evidence to the files actually built.

Validate without contacting Cloudflare:

```bash
corepack yarn streetlight:cloudflare:check
```

## Deploy

If `packages/twenty-front/build` exists locally, Docker requires a matching
`.source-revision` receipt instead of silently reusing potentially stale output.
After committing the reviewed source, build and stamp it from a clean checkout:

```bash
test -z "$(git status --porcelain --untracked-files=all)" &&
npx nx build twenty-front --skip-nx-cache &&
test -z "$(git status --porcelain --untracked-files=all)" &&
git rev-parse HEAD > packages/twenty-front/build/.source-revision
```

Without host output, Docker builds the frontend itself. Never copy a receipt
onto an old build or reuse it after changing source or dependencies.

Deployment builds the production `streetlight-cloudflare` target for
`linux/amd64`, publishes the Worker, pushes the image to Cloudflare's managed
registry, and creates the two Container instances on first traffic or the next
scheduled check:

```bash
corepack yarn streetlight:cloudflare:deploy --tenant=sjca
```

The deployment command validates both local configuration files, binds Wrangler
to the manifest's account, and performs a read-only Cloudflare preflight. The
preflight verifies that the active zone belongs to the expected account and
that the hostname is unused or already belongs to the same Worker. The command
then confirms the Corresponding Source URL is public and derives the Worker
name, custom-domain route, tenant labels, and image labels. It wraps the runtime
environment as the required Worker secret in a permission-restricted temporary
file, supplies the secret with the new Worker version, and removes temporary
files even when Wrangler fails. It does not place secret values in shell
history.

Cloudflare activates Worker code before its container image operation
finishes. Treat the command result as rollout-start evidence, not acceptance.

## Acceptance and recovery

Do not import organizational donor data until all gates pass:

- the public `/healthz` route is healthy after a cold start and a redeploy;
- container logs show one web role and one queue-worker role on the reviewed
  image revision;
- the queue worker remains running beyond its startup grace period and recovers
  on the next five-minute scheduled check after a forced stop;
- database migrations run once and the queue worker processes a synthetic job;
- login, invitation, password reset, email, R2 upload, and R2 download pass;
- a synthetic donor and donation pass through acknowledgment and export;
- required logic functions execute only in the approved isolated runtime and
  cannot read server, database, Redis, R2, or SMTP credentials;
- PostgreSQL restore and R2 recovery are proven in an isolated environment;
- the authenticated application presents a prominent, easy-to-find source-code
  link to `/source`; `/source` redirects to the public Corresponding Source for
  the running AGPL build; and `/.well-known/streetlight-source` reports the same
  revision; and
- alerting, log retention, incident ownership, and a rollback revision are
  documented.

Rollback Worker and image changes together. Cloudflare deploys them in
separate phases, so keep adjacent revisions and database schemas compatible
during a rollout. Rehearse backup restore and failed migration recovery before
each organization is accepted. Before any upgrade, place the CRM in a
maintenance window, stop intake, prove the queue is empty, and stop the worker.
The deploy path fails server startup when the database upgrade command fails,
but it cannot drain an in-flight job automatically.
