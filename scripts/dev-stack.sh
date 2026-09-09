#!/usr/bin/env bash
# Brings up the API and web app together. Mongo is expected to be running
# already.
#
#   ./scripts/dev-stack.sh          real model, read from .env
#   ./scripts/dev-stack.sh --stub   a canned model double, no key and no spend
#
# The double always returns the same fixed kit whatever you send it, so it is
# for exercising the plumbing, never for judging output quality.
set -uo pipefail

cd "$(dirname "$0")/.."

STUB=0
[ "${1:-}" = "--stub" ] && STUB=1

API_PORT="${API_PORT:-4400}"
WEB_PORT="${WEB_PORT:-3400}"
MONGO="${MONGO_URL:-mongodb://127.0.0.1:27018}"
LOGS="${LOGS:-/tmp/prepkit}"

mkdir -p "$LOGS"
pids=()

cleanup() {
  echo "stopping…"
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null
  done
  wait 2>/dev/null
}
trap cleanup EXIT INT TERM

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

if [ "$STUB" = "1" ]; then
  npx tsx scripts/serve-fake-provider.ts > "$LOGS/provider.log" 2>&1 &
  pids+=($!)

  # Only useful alongside the double: these are local fixture company sites.
  npx tsx scripts/serve-fixtures.ts > "$LOGS/fixtures.log" 2>&1 &
  pids+=($!)

  # The double binds an ephemeral port and prints it, so the API has to wait
  # for the address rather than assume one.
  provider=""
  for _ in $(seq 1 40); do
    provider=$(grep -o 'http://[^ ]*' "$LOGS/provider.log" 2>/dev/null | head -1)
    [ -n "$provider" ] && break
    sleep 0.5
  done
  if [ -z "$provider" ]; then
    echo "the model double never reported an address" >&2
    exit 1
  fi

  export LLM_PROVIDER=gemini
  export GEMINI_API_KEY=fake-key-for-the-double
  export LLM_BASE_URL="$provider"
  # Fixture sites are served from a loopback address.
  export ALLOW_PRIVATE_HOSTS=true
  echo "model         STUB (canned output, ignores your input)  $provider"
  echo "fixtures      http://127.0.0.1:8099"
else
  # A real run must not silently fall back to a double, so the key is checked
  # here rather than failing later inside a generation.
  if [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -z "${GEMINI_API_KEY:-}" ]; then
    echo "No ANTHROPIC_API_KEY or GEMINI_API_KEY found in .env." >&2
    echo "Add one, or run with --stub to use the canned model double." >&2
    exit 1
  fi
  unset LLM_BASE_URL
  echo "model         REAL  ${LLM_PROVIDER:-auto} ${LLM_MODEL:-default}"
fi

SESSION_SECRET="${SESSION_SECRET:-local-dev-only-secret}" \
MONGO_URL="$MONGO" \
MONGO_DB="${MONGO_DB:-prepkit_dev}" \
PORT="$API_PORT" \
WEB_ORIGIN="http://localhost:$WEB_PORT" \
  npx tsx src/server/index.ts > "$LOGS/api.log" 2>&1 &
pids+=($!)

(cd web && NEXT_PUBLIC_API_URL="http://localhost:$API_PORT" \
  npx next dev -p "$WEB_PORT" > "$LOGS/web.log" 2>&1) &
pids+=($!)

for _ in $(seq 1 60); do
  api=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$API_PORT/health")
  web=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$WEB_PORT/")
  if [ "$api" = "200" ] && [ "$web" = "200" ]; then
    echo "api           http://localhost:$API_PORT"
    echo "web           http://localhost:$WEB_PORT"
    echo "STACK READY"
    break
  fi
  sleep 1
done

wait
