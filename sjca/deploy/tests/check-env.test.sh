#!/usr/bin/env bash
# Tests for check-env.sh. Run: bash sjca/deploy/tests/check-env.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY="$(dirname "$HERE")"
CHECK="$DEPLOY/check-env.sh"
EXAMPLE="$DEPLOY/sjca.env.example"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

FAILED=0
pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAILED=1; }

# Build a complete file: every key from the example gets a real-looking value.
COMPLETE="$TMP/complete.env"
grep -E '^[A-Z_][A-Z0-9_]*=' "$EXAMPLE" | cut -d= -f1 | while read -r key; do
  echo "$key=value-for-$key"
done > "$COMPLETE"

# Case 1: the example file fails and names APP_SECRET.
out="$(bash "$CHECK" "$EXAMPLE" 2>&1)"; code=$?
if [ "$code" -eq 1 ] && grep -q 'APP_SECRET' <<<"$out"; then
  pass "example file fails and names APP_SECRET"
else
  fail "example file fails and names APP_SECRET (exit=$code)"
fi

# Case 2: a complete file passes.
out="$(bash "$CHECK" "$COMPLETE" 2>&1)"; code=$?
if [ "$code" -eq 0 ] && grep -q '^OK$' <<<"$out"; then
  pass "complete file passes"
else
  fail "complete file passes (exit=$code)"
fi

# Case 3: a file without TUNNEL_TOKEN fails and names it.
NOTUNNEL="$TMP/notunnel.env"
grep -v '^TUNNEL_TOKEN=' "$COMPLETE" > "$NOTUNNEL"
out="$(bash "$CHECK" "$NOTUNNEL" 2>&1)"; code=$?
if [ "$code" -eq 1 ] && grep -q 'MISSING TUNNEL_TOKEN' <<<"$out"; then
  pass "file without TUNNEL_TOKEN fails and names it"
else
  fail "file without TUNNEL_TOKEN fails and names it (exit=$code)"
fi

# Case 4: an empty value fails.
EMPTY="$TMP/empty.env"
sed 's/^APP_SECRET=.*/APP_SECRET=/' "$COMPLETE" > "$EMPTY"
out="$(bash "$CHECK" "$EMPTY" 2>&1)"; code=$?
if [ "$code" -eq 1 ] && grep -q 'MISSING APP_SECRET' <<<"$out"; then
  pass "empty value fails"
else
  fail "empty value fails (exit=$code)"
fi

# Case 5: output never prints values.
SECRET="$TMP/secret.env"
sed 's/^APP_SECRET=.*/APP_SECRET=Replace-SuperSecret123/' "$COMPLETE" > "$SECRET"
out="$(bash "$CHECK" "$SECRET" 2>&1)"; code=$?
if [ "$code" -eq 1 ] && grep -q 'PLACEHOLDER APP_SECRET' <<<"$out" && ! grep -q 'SuperSecret123' <<<"$out"; then
  pass "placeholder fails and value is not printed"
else
  fail "placeholder fails and value is not printed (exit=$code)"
fi

exit "$FAILED"
