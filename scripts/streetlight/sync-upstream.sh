#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "Usage: $0 --source=<repository-directory> --revision=<40-character-sha> [--apply]"
}

source_repository_directory=""
source_revision=""
apply_changes="false"

for argument in "$@"; do
  case "$argument" in
    --source=*)
      source_repository_directory="${argument#--source=}"
      ;;
    --revision=*)
      source_revision="${argument#--revision=}"
      ;;
    --apply)
      apply_changes="true"
      ;;
    *)
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$source_repository_directory" || ! "$source_revision" =~ ^[0-9a-f]{40}$ ]]; then
  usage
  exit 1
fi

mirror_repository_directory="$(git rev-parse --show-toplevel)"
source_repository_directory="$(git -C "$source_repository_directory" rev-parse --show-toplevel)"
upstream_state_path="$mirror_repository_directory/.streetlight/upstream.json"

if [[ -n "$(git -C "$mirror_repository_directory" status --porcelain --untracked-files=all)" ]]; then
  echo "The SJCA mirror must be clean before preparing a synchronization."
  exit 1
fi

if [[ "$(git -C "$mirror_repository_directory" branch --show-current)" != "main" ]]; then
  echo "Run synchronization from the SJCA mirror main branch."
  exit 1
fi

source_repository="$(
  node --input-type=module - "$upstream_state_path" <<'NODE'
import { readFileSync } from 'node:fs';

const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));

if (
  typeof state.repository !== 'string' ||
  typeof state.revision !== 'string'
) {
  throw new Error('Invalid .streetlight/upstream.json');
}

console.log(state.repository);
NODE
)"

previous_source_revision="$(
  node --input-type=module - "$upstream_state_path" <<'NODE'
import { readFileSync } from 'node:fs';

const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));

if (typeof state.revision !== 'string') {
  throw new Error('Invalid .streetlight/upstream.json');
}

console.log(state.revision);
NODE
)"
source_origin_url="$(git -C "$source_repository_directory" config --get remote.origin.url)"
normalized_source_origin_url="${source_origin_url%.git}"
normalized_source_origin_url="${normalized_source_origin_url#git@github.com:}"
normalized_source_origin_url="${normalized_source_origin_url#https://github.com/}"

if [[ "$normalized_source_origin_url" != "$source_repository" ]]; then
  echo "The source checkout origin must be https://github.com/$source_repository.git."
  exit 1
fi

git -C "$source_repository_directory" cat-file -e "${previous_source_revision}^{commit}"
git -C "$source_repository_directory" cat-file -e "${source_revision}^{commit}"

if ! git -C "$source_repository_directory" merge-base --is-ancestor \
  "$previous_source_revision" "$source_revision"; then
  echo "The requested revision must descend from the last approved source revision."
  exit 1
fi

if [[ "$previous_source_revision" == "$source_revision" ]]; then
  echo "The SJCA mirror already records source revision $source_revision."
  exit 0
fi

blocked_path=""
while IFS= read -r -d '' changed_path; do
  case "$changed_path" in
    *.env.example)
      ;;
    .env|*/.env|*.env|*.env.*|*.pem|*.key|*.p12|*.pfx|*.crt|*.cer|*.der|*.jks|*.keystore|*.mobileprovision|.mcp.json|*/.mcp.json|*/runtime-env.json|*/deployment.json|*/secrets/*|.claude-flow/*|.swarm/*|agentdb.rvf|agentdb.rvf.idmap.json|ruvector.db|.streetlight/upstream.json|scripts/streetlight/sync-upstream.sh|.github/CODEOWNERS|.github/workflows/deploy-sjca-cloudflare.yaml|docs/streetlight/SJCA_AUTOMATION.md|packages/streetlight-cloudflare/tenants/sjca/*)
      blocked_path="$changed_path"
      break
      ;;
  esac
done < <(
  git -C "$source_repository_directory" diff --name-only -z \
    "$previous_source_revision" "$source_revision"
)

if [[ -n "$blocked_path" ]]; then
  echo "Synchronization rejected a private, credential-bearing, or SJCA-owned path: $blocked_path"
  exit 1
fi

temporary_patch="$(mktemp "${TMPDIR:-/tmp}/streetlight-sync.XXXXXX")"
trap 'rm -f -- "$temporary_patch"' EXIT

git -C "$source_repository_directory" diff --binary --full-index \
  "$previous_source_revision" "$source_revision" -- > "$temporary_patch"

if [[ ! -s "$temporary_patch" ]]; then
  echo "The selected source range contains no file changes."
  exit 0
fi

git -C "$mirror_repository_directory" apply --check --binary "$temporary_patch"

echo "Source range: $previous_source_revision..$source_revision"
git -C "$source_repository_directory" diff --stat \
  "$previous_source_revision" "$source_revision"
git -C "$source_repository_directory" diff --name-status \
  "$previous_source_revision" "$source_revision"

if [[ "$apply_changes" != "true" ]]; then
  echo "Preview complete. Re-run with --apply to create a local review branch."
  exit 0
fi

synchronization_branch="sync/streetlight-${source_revision:0:12}"

if git -C "$mirror_repository_directory" show-ref --verify --quiet \
  "refs/heads/$synchronization_branch"; then
  echo "Local branch $synchronization_branch already exists."
  exit 1
fi

git -C "$mirror_repository_directory" switch -c "$synchronization_branch"
git -C "$mirror_repository_directory" apply --index --binary "$temporary_patch"

node --input-type=module - "$upstream_state_path" "$source_revision" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';

const statePath = process.argv[2];
const revision = process.argv[3];
const state = JSON.parse(readFileSync(statePath, 'utf8'));

writeFileSync(
  statePath,
  `${JSON.stringify({ ...state, revision }, null, 2)}\n`,
);
NODE

git -C "$mirror_repository_directory" add -- .streetlight/upstream.json
git -C "$mirror_repository_directory" diff --cached --check

echo "Prepared $synchronization_branch with staged changes only."
echo "Review the complete staged diff and public-source safety before committing or pushing."
