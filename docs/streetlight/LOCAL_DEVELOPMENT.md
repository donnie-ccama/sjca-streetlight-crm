# Local development

## Prerequisites

- Docker Desktop
- `mise` (recommended) or another Node version manager
- Node 24.16.0, matching `.nvmrc`
- Git

The helper scripts deliberately use ports `3100`, `3101`, `56432`, and `57379`
so they do not touch services already running on this machine.

## First installation

```bash
cd "/Users/donnielane/Documents/Streetlight CRM"
mise install node@24.16.0
./scripts/streetlight/node24.sh corepack enable
./scripts/streetlight/node24.sh corepack yarn streetlight:bootstrap
```

The bootstrap command:

1. starts an isolated PostgreSQL and Redis pair;
2. installs the pinned Yarn dependencies;
3. creates ignored local environment files when missing; and
4. initializes the Twenty database without deleting an existing database.

Start the source development server:

```bash
./scripts/streetlight/node24.sh corepack yarn streetlight:dev
```

Open `http://localhost:3101`. The API health endpoint is
`http://localhost:3100/healthz`.

The frontend hot-reloads. The API and queue worker run from one freshly built
server output so they cannot overwrite each other; restart `streetlight:dev`
after changing backend source.

Run a smoke check in another terminal:

```bash
./scripts/streetlight/node24.sh corepack yarn streetlight:smoke
```

Stop the infrastructure without deleting its database:

```bash
./scripts/streetlight/node24.sh corepack yarn streetlight:infra:down
```

Do not add `-v` unless you intentionally want to erase the local development
database.

## Donor application checks

The app is an intentionally separate package because Twenty Apps have their own
build and deployment lifecycle:

```bash
cd packages/twenty-apps/public/streetlight-crm
../../../../scripts/streetlight/node24.sh corepack yarn install --immutable
../../../../scripts/streetlight/node24.sh corepack yarn lint
../../../../scripts/streetlight/node24.sh corepack yarn typecheck
../../../../scripts/streetlight/node24.sh corepack yarn test:unit
```

Use [APP_INSTALLATION.md](./APP_INSTALLATION.md) after creating a local
workspace and API key. Integration tests are deliberately gated; run them only
after exporting `TWENTY_API_URL` and a short-lived local `TWENTY_API_KEY`:

```bash
../../../../scripts/streetlight/node24.sh corepack yarn test
```

## Migration utility checks

The reusable Aplos migration utilities have no customer exports in this
repository. Run their isolated test suite from the repository root with:

```bash
./scripts/streetlight/node24.sh corepack yarn streetlight:migration:test
```
