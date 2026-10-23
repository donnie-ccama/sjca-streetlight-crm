# Security baseline

This repository starts from Twenty `v2.50.0` and adds Streetlight-specific
controls. A clean source scan does not prove a safe production deployment; the
container, configuration, network, database, object storage, email, backups,
and restore path all need environment-specific validation.

## Current source and dependency checks

The October 22, 2026 bootstrap verified:

- deep Ruflo code scans reported no findings in the Streetlight app or deploy
  directory;
- the standalone Streetlight app's recursive Yarn audit reported no high or
  critical advisories;
- Streetlight app lint, typecheck, 51 unit tests, and application build passed;
- patched runtime versions were pinned for GraphQL Tools, DOMPurify,
  follow-redirects, http-cache-semantics, markdown-it, Vue, and the Vue server
  renderer; and
- direct Twenty server and frontend typechecks passed after those pins.

The pins are documented in the root `package.json`. Re-evaluate and remove them
when a newer Twenty release resolves the same advisories.

## Known development-tool findings

The full monorepo audit still reports findings outside the final CRM runtime:

- `braces` 3.0.3 is reached through the Nest development watcher. The registry
  has no fixed release as of this review. Do not expose watch-mode development
  servers to untrusted networks or pass attacker-controlled glob patterns.
- Storybook 10.4.6 has critical and high origin-validation/code-injection
  advisories, and Vite 8.0.16 has a high Windows launch-editor advisory. They
  are build and test tools; the production Dockerfile copies the static
  frontend output and runs `yarn workspaces focus --production` for the server.
  Do not expose Storybook or Vite outside a trusted development machine.
- The unused `twenty-website` workspace resolves Next.js 16.3.8, which the
  audit reports with two critical remote-code-execution advisories and one high
  denial-of-service advisory. That website workspace is not copied into the
  Streetlight CRM image and must not be deployed from this pinned baseline.
- The unused documentation workspace reaches MCP SDK 1.30.0 through Mintlify
  and reports three high advisories involving OAuth credential routing, task
  session binding, and request-validation memory exhaustion. The documentation
  workspace is not copied into the Streetlight CRM image.

These exceptions are not permission to ignore future fixes. Upgrade and retest
the tooling when compatible patched releases are available.

## Production gate

Before deploying an image:

1. build from a clean reviewed commit and tag the image immutably;
2. generate an SBOM and scan the final image, not only the repository lockfile;
3. reject unresolved critical or reachable high findings;
4. verify TLS, origin rules, rate limits, email, R2 permissions, database and
   Redis transport security, backups, and a real restore drill;
5. keep all secrets in the host or provider secret store; and
6. run authenticated acceptance tests with synthetic data before importing any
   customer records.

Never copy donor exports, local databases, API keys, or Ruflo runtime stores
into the image or Git repository.
