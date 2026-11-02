# Local development on macOS

This page gives the exact commands to run the SJCA Streetlight CRM monorepo on
one Mac. For the shorter Streetlight-specific notes, see
[docs/streetlight/LOCAL_DEVELOPMENT.md](./streetlight/LOCAL_DEVELOPMENT.md).

## Versions

| Tool | Version | Source |
| --- | --- | --- |
| Node | 24.16.0 | `.nvmrc` |
| Yarn | 4.13.0 | `packageManager` in `package.json` |
| PostgreSQL | 16 | `deploy/streetlight/compose.dev.yml` |
| Redis | 7 | `deploy/streetlight/compose.dev.yml` |

Do not change the global Node version. Use `nvm` or `mise` to select 24.16.0
for this repository only.

## Ports

| Service | URL or port | Notes |
| --- | --- | --- |
| API server | http://localhost:3100 | Health check at `/healthz` |
| Frontend | http://localhost:3101 | Vite dev server with hot reload |
| PostgreSQL | 127.0.0.1:56432 | Container `streetlight-crm-dev-db-1` |
| Redis | 127.0.0.1:57379 | Container `streetlight-crm-dev-redis-1` |

These ports are deliberately not the upstream Twenty defaults of 3000, 3001,
5432 and 6379. Other local containers often hold the default ports.

## One-time installation

```bash
brew install nvm
mkdir -p ~/.nvm
```

Add these lines to `~/.zshrc`, then open a new terminal:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"
```

Install the pinned Node version and enable Yarn:

```bash
nvm install 24.16.0
nvm alias default 24.16.0
corepack enable
```

Start Docker Desktop, then bootstrap the repository:

```bash
cd "/Users/donnielane/Documents/SJCA Streetlight CRM"
open -a Docker
corepack yarn streetlight:bootstrap
```

The bootstrap script starts PostgreSQL and Redis, installs the pinned
dependencies, creates the ignored `.env` files, and runs the database
migrations. It does not delete an existing local database.

## Environment files

Git ignores all three files. Never commit them.

| File | Template |
| --- | --- |
| `packages/twenty-server/.env` | `deploy/streetlight/development.env.example` |
| `packages/twenty-front/.env` | `deploy/streetlight/frontend.env.example` |
| `packages/twenty-apps/public/streetlight-crm/.env` | the same folder `.env.example` |

Replace `APP_SECRET` in the server file with a random local-only value:

```bash
openssl rand -base64 32
```

The app `.env` needs `TWENTY_API_KEY`. Create that key in the local workspace
under Settings > APIs. Use a local key only. Never point this file at a live
workspace.

## Start and stop

Start everything (frontend, API and queue worker):

```bash
corepack yarn streetlight:dev
```

Start in the background with logs in `/tmp`:

```bash
nohup corepack yarn streetlight:dev > /tmp/sjca-crm-dev.log 2>&1 &
```

Check that both sides answer:

```bash
corepack yarn streetlight:smoke
curl http://localhost:3100/healthz
```

Stop the dev server:

```bash
pkill -f "concurrently.js --kill-others"
```

Stop the database and Redis but keep the data:

```bash
corepack yarn streetlight:infra:down
```

Add `-v` to that compose command only when you want to erase the local
database.

## Sign in

The dev server sets `SIGN_IN_PREFILLED=true`, so the sign-in form fills the
seeded developer account for you. Open http://localhost:3101 and submit the
form.

The prefilled values live in
`packages/twenty-front/src/modules/auth/sign-in-up/hooks/useSignInUpForm.ts`.
The seeded users come from the Twenty seed data that `database:init` loads.
These credentials are for local development only.

## Build

```bash
corepack yarn nx build twenty-shared
corepack yarn nx build twenty-server
corepack yarn nx build twenty-front
```

Build `twenty-shared` first after you switch branches or edit that package.
Its `dist` folder is per-branch state that nothing tracks.

## Tests and typecheck

Monorepo:

```bash
corepack yarn nx run-many -t typecheck -p twenty-shared twenty-ui twenty-server twenty-front
corepack yarn nx run-many -t test -p twenty-shared twenty-ui twenty-server twenty-front
```

One file:

```bash
npx jest path/to/file.spec.ts --config=packages/twenty-server/jest.config.mjs
```

Donor app package:

```bash
cd packages/twenty-apps/public/streetlight-crm
corepack yarn install --immutable
corepack yarn lint
corepack yarn typecheck
corepack yarn test:unit
```

`yarn test` in that folder also runs integration tests. Those tests need
`TWENTY_API_URL` and `TWENTY_API_KEY` for a disposable local workspace.

## Troubleshooting

**`Node 24 is required`** — `scripts/streetlight/node24.sh` looks for `mise`,
then for an active Node 24, then for `nvm`. Run `nvm use 24.16.0` first, or
install `mise`.

**`Docker is not running`** — run `open -a Docker` and wait until
`docker info` succeeds.

**Port 3100 or 3101 already in use** — find the holder with
`lsof -nP -iTCP:3100 -sTCP:LISTEN`. Other local projects often use 3000 and
3001, which is why this repository uses 3100 and 3101.

**The API cannot reach the database** — check the containers with
`docker compose -f deploy/streetlight/compose.dev.yml ps`. The server reads
`PG_DATABASE_URL` from `packages/twenty-server/.env`. The port must be 56432.

**Typecheck or tests fail right after a branch switch** — rebuild the shared
package, then run the check again:

```bash
corepack yarn nx build twenty-shared --skip-nx-cache
```

**Nx returns a stale pass** — add `--skip-nx-cache`, or run the compiler
directly inside the package with `npx tsgo -p tsconfig.json --noEmit`.

**Backend changes do not appear** — the dev script builds the server once.
The API and the worker both run from that output. Restart `streetlight:dev`
after you change backend source. The frontend hot-reloads without a restart.
