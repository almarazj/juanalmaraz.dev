#!/usr/bin/env bash
# Builds the Lambda image and runs it against the Docker services from `pnpm services`.
set -euo pipefail
cd "$(dirname "$0")/.."

PLATFORM="${PLATFORM:-linux/arm64}"
PORT="${SMOKE_PORT:-18080}"
IMAGE=juanalmaraz-smoke
MAX_BYTES=$((500 * 1024 * 1024))
CID=

cleanup() { [ -z "$CID" ] || docker rm -f "$CID" >/dev/null; }
trap cleanup EXIT

docker buildx build --platform "$PLATFORM" --load -t "$IMAGE" .

# `inspect .Size` also counts compressed blobs under the containerd store, so measure the unpacked filesystem.
size=$(( $(docker run --rm --user root --platform "$PLATFORM" --entrypoint du "$IMAGE" -sxk / | cut -f1) * 1024 ))
echo "image size: $((size / 1024 / 1024)) MB"
[ "$size" -lt "$MAX_BYTES" ] || { echo "FAIL: image is over 500 MB" >&2; exit 1; }

# Host networking shares the host's ports, so a foreign listener would answer instead of the container.
if (exec 3<>"/dev/tcp/localhost/$PORT") 2>/dev/null; then
  echo "FAIL: port $PORT is already in use (set SMOKE_PORT)" >&2
  exit 1
fi

pnpm seed >/dev/null

# Host networking reaches the services on localhost, as on the host.
CID=$(docker run -d --platform "$PLATFORM" --network host \
  -e PORT="$PORT" \
  -e AWS_ENDPOINT_URL_DYNAMODB=http://localhost:8000 \
  -e AWS_ENDPOINT_URL_S3=http://localhost:9000 \
  -e ADMIN_EMAIL=admin@example.com \
  -e SESSION_KEY=smoke-session-key \
  "$IMAGE")

ready=0
for _ in $(seq 60); do
  [ "$(docker inspect -f '{{.State.Running}}' "$CID")" = true ] || break
  if [ "$(curl -fs "http://localhost:$PORT/internal/ready" || true)" = ok ]; then ready=1; break; fi
  sleep 1
done
[ "$ready" = 1 ] || { echo "FAIL: /internal/ready never returned ok" >&2; docker logs "$CID" >&2; exit 1; }

fail=0
for path in /internal/ready / /api/me /api/health; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT$path")
  echo "$code $path"
  [ "$code" = 200 ] || fail=1
done
[ "$fail" = 0 ] || { docker logs "$CID" >&2; exit 1; }
echo "smoke OK"
