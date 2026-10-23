# SJCA source synchronization and deployment

The private `donnie-ccama/streetlight-crm` repository and the public SJCA
repository have intentionally separate histories. Do not merge their branches,
force-push either repository, or copy an entire private working tree into the
public mirror.

## Deliberate source synchronization

`.streetlight/upstream.json` records the last private Streetlight revision that
was accepted as the synchronization baseline. The synchronization script
applies only the committed patch after that revision. It rejects non-descendant
history, dirty mirror state, overlapping changes that cannot apply cleanly, and
common credential-bearing paths.

Preview an exact committed source revision first:

```bash
corepack yarn streetlight:sync:sjca \
  --source="/absolute/path/to/private/streetlight-crm" \
  --revision="40-character-source-commit-sha"
```

After reviewing the path list, prepare a local review branch:

```bash
corepack yarn streetlight:sync:sjca \
  --source="/absolute/path/to/private/streetlight-crm" \
  --revision="40-character-source-commit-sha" \
  --apply
```

The script creates `sync/streetlight-<short-sha>` and stages the patch plus the
updated source marker. It never commits, pushes, opens a pull request, or
deploys. Before publication:

1. inspect every staged path and the complete diff;
2. confirm no private data, credentials, customer data, or internal-only code
   would enter the public repository;
3. run the tests appropriate to the changed packages;
4. commit and push only the reviewed branch; and
5. merge it through a reviewed pull request.

If the private repository is published as another unrelated snapshot, the
ancestry check fails. Establish a new baseline only after a fresh public-source
audit; do not bypass the check.

## Gated Wrangler deployment

`.github/workflows/deploy-sjca-cloudflare.yaml` contains the production
Wrangler workflow. A push to `main` deploys only when the repository variable
`SJCA_AUTODEPLOY_ENABLED` equals `true`. Until then, push-triggered runs are
skipped. A manual run requires typing `DEPLOY`.

Configure the `sjca-production` GitHub environment before activation:

- repository variable `CLOUDFLARE_ACCOUNT_ID`;
- repository variable `SJCA_CLOUDFLARE_ZONE_ID`;
- environment secret `CLOUDFLARE_API_TOKEN`, limited to the SJCA Cloudflare
  account, Worker, Containers, route, and required read access; and
- environment secret `SJCA_RUNTIME_ENV_JSON`, containing the complete validated
  runtime JSON that is never committed.

Protect `main`, require review for workflow changes, and decide whether the
`sjca-production` environment should require a deployment reviewer. The
workflow materializes ignored mode-0600 configuration files, validates the
Cloudflare package, and calls the repository's Wrangler deployment wrapper.

Keep `SJCA_AUTODEPLOY_ENABLED` unset until the initial deployment passes health,
container, login, email, R2, queue, and recovery acceptance. Enabling the
variable is an explicit production-control change and should be recorded with
the accepted source revision and rollback revision.
