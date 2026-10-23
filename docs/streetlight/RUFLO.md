# Ruflo coordination

Ruflo is the durable coordination and evidence ledger for broad Streetlight CRM
work. Codex or another coding agent still performs the implementation and runs
the tests. Ruflo does not receive release authority.

## Project profile

`config/ruflo/project.json` pins Ruflo 3.59.17 and defines the working limits:

- hierarchical topology with a four-agent ceiling;
- specialized roles and one writer per worktree;
- observe-mode policy while the project is being established;
- independent read-only verification for security and deployment work; and
- no automatic commit, push, deployment, publication, spending, or secret use.

The local `.claude-flow/` and `.swarm/` directories are ignored. They contain
machine-specific policy receipts, task history, and databases. The tracked
profile and scripts are the reproducible source of configuration.

## First setup on a machine

Run this in an interactive local terminal:

```bash
corepack yarn streetlight:ruflo:setup
```

The setup command establishes the local policy ledger anchor, selects observe
mode, verifies the receipt chain, initializes memory, and creates the bounded
swarm. It also pretrains the local repository index and generates coder,
architect, tester, security-architect, and reviewer profiles under the ignored
`.claude-flow/agents/` directory. Policy administration intentionally refuses
non-interactive execution.

Check the installation at any time:

```bash
corepack yarn streetlight:ruflo:status
```

## Working session

For work spanning three or more files, security boundaries, deployment, APIs,
or multiple packages:

1. Search Ruflo memory and relevant ADRs for prior constraints.
2. Inspect repository, dependency, runtime, policy, and service health.
3. Record the route and start receipt in one command:

   ```bash
   corepack yarn streetlight:ruflo:start -- "describe the work and acceptance criteria"
   ```

4. Give each writing agent an isolated worktree. A shared checkout is only for
   read-only research or verification.
5. Record focused tests, integration checks, security results, and exact source
   state before reporting completion.
6. Close the task using the task ID printed by `pre-task`:

   ```bash
   corepack yarn streetlight:ruflo:finish -- TASK_ID "same task description"
   ```

The description and coordinator identity let Ruflo retain the routing outcome,
not just a success flag.

Use `streetlight:ruflo:route` when you only need a recommendation and do not
intend to open a task receipt.

If the installed harness exposes exclusive path claims, acquire only the exact
paths and development ports needed, renew long-running leases, and release them
at handoff. A claim prevents collisions; it does not authorize deployment,
publication, spending, or access to secrets.

## Release boundary

Ruflo may recommend, route, remember, and record evidence. A human remains the
release gate. Do not configure hooks or agents to commit, push, merge, deploy,
publish images, purchase infrastructure, rotate credentials, or import donor
data without a separate explicit instruction.

Observe mode records default-deny decisions but does not block an executor. It
is an evidence layer, not an authorization or sandbox boundary. Move to
enforcement only after explicit policy rules and their failure paths have been
reviewed and tested.
