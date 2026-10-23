# Data-safety boundary

This repository contains product source code and reusable migration utilities.
It does not contain donor records.

## Never commit

- `.env` files, tokens, API keys, private keys, or certificates
- source-system exports or transformed donor files
- database dumps, reconciliation output, ID maps, or migration logs
- tenant-specific workspace metadata snapshots
- runtime databases, agent memory databases, or browser/session state
- generated app output or dependency directories

The root `.gitignore` blocks these classes throughout the repository. That is a
backstop, not permission to place real donor data in the checkout.

## Migration workflow

1. Keep raw exports in an encrypted, access-controlled working directory
   outside this Git repository.
2. Use a dedicated staging workspace with synthetic records first.
3. Give migration credentials the least privileges and shortest useful life.
4. Produce counts, totals, exception lists, and rollback evidence without
   copying source records into Git.
5. Require an authorized person to approve the production import.
6. Delete temporary exports according to the customer's retention policy.

The reusable Aplos utilities under `tools/streetlight/aplos-migration` are not
part of the running CRM container. Configure them from an ignored `.env` file
and point their input/output paths outside the repository.

## Existing hosted system

The earlier app contained a long-lived export capability in tracked history.
That value was not copied here. Treat the old capability as compromised and
disable or rotate it in the existing hosted instance before relying on that
instance's export boundary.
