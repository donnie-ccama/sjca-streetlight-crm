# Streetlight app installation

The Twenty core container and the Streetlight donor app are versioned together
in this repository, but they are installed through separate mechanisms.

## Local workspace

1. Start Streetlight CRM and complete the first-workspace setup at
   `http://localhost:3101`.
2. In the workspace settings, create a short-lived API key for app development.
3. In `packages/twenty-apps/public/streetlight-crm`, copy `.env.example` to
   `.env` and place the key only in that ignored file.
4. Review the plan before applying it:

```bash
./scripts/streetlight/node24.sh corepack yarn --cwd packages/twenty-apps/public/streetlight-crm twenty plan
```

5. Apply only after the plan shows the expected Streetlight-owned objects,
   fields, views, functions, and components:

```bash
./scripts/streetlight/node24.sh corepack yarn --cwd packages/twenty-apps/public/streetlight-crm twenty apply
```

Never automate an apply against a production workspace using a developer's
broad API key.

## Release rule

Build and test the app against the same Twenty version as the server. The
current package pins the Twenty SDK, client SDK, and UI packages to `2.50.0`.
Preserve all universal identifiers after the first workspace installation;
changing them creates new metadata instead of upgrading existing metadata.
