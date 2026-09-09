#!/usr/bin/env bash
# Brings up the whole stack against a model double, so the app can be driven
# end to end with no API key and no spend. Mongo is expected to be running
# already; everything else is started here and torn down together.
set -uo pipefail

cd "$(dirname "$0")/.."

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

npx tsx scripts/serve-fake-provider.ts > "$LOGS/provider.log" 2>&1 &
pids+=($!)

npx tsx scripts/serve-fixtures.ts > "$LOGS/fixtures.log" 2>&1 &
pids+=($!)

# The double binds an ephemeral port and prints it, so the API has to wait for
# the address rather than assume one.
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
echo "model double  $provider"

SESSION_SECRET=local-dev-only-secret \
MONGO_URL="$MONGO" \
MONGO_DB=prepkit_dev \
PORT="$API_PORT" \
WEB_ORIGIN="http://localhost:$WEB_PORT" \
LLM_PROVIDER=gemini \
GEMINI_API_KEY=fake-key-for-the-double \
LLM_BASE_URL="$provider" \
ALLOW_PRIVATE_HOSTS=true \
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
    echo "fixtures      http://127.0.0.1:8099"
    echo "STACK READY"
    break
  fi
  sleep 1
done

wait
