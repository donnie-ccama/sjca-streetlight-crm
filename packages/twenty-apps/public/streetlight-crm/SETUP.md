# App development

## Prerequisites

- Node.js and Yarn versions declared by the repository root.
- A running local Streetlight CRM server.
- A local API key used only for application plan/apply operations.

## Install and verify

From this directory:

```bash
yarn install --immutable
yarn lint
yarn typecheck
yarn test:unit
```

Copy `.env.example` to `.env`, create a local-only API key in the development
workspace, and then run:

```bash
yarn twenty plan
yarn twenty apply
yarn twenty dev
```

Export the two variables from that ignored file before running integration
tests with `yarn test`. Never commit `.env`, API keys, customer exports, or
generated `.twenty` output. Integration tests require a disposable local
workspace and synthetic records; unit tests do not contact a server.
