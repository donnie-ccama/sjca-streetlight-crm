# Streetlight CRM Donor Operations

MIT-licensed nonprofit donor operations app for Streetlight CRM, built with
the Twenty application SDK.

## Capabilities

- Daily gift entry for checks, cards, ACH, wire, stock, cash, in-kind, and
  other income.
- Donor and organization lookup, fund and campaign designation, batch entry,
  retry-safe writes, and focused cash-deposit and online-gift workflows.
- Donor dashboards for current-year giving, monthly activity, lapsed donors,
  top donors, and pending acknowledgments.
- Authenticated CSV exports with spreadsheet formula-injection protection.
- Person giving rollups plus acknowledgment generation and completion helpers.

The app owns its schema on fresh Streetlight CRM installations. Stable
universal identifiers are retained so deployments and upgrades reconcile the
same metadata instead of creating duplicates.

See [SETUP.md](SETUP.md) for local application development. Core development
and production deployment are documented in `docs/streetlight/` at the
repository root.

## License

This application package is MIT-licensed under the Twenty Application
Exception. Streetlight CRM core remains governed by the license notices in the
repository root.
