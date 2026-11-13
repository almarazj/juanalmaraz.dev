#!/usr/bin/env bash
# Usage: deploy.sh <image-uri> <verify command...>
# Publishes the image as a new Lambda version, moves the `live` alias to it and runs the verify command.
# If anything fails after the alias moved, points `live` back and invalidates CloudFront again.
# Needs FUNCTION_NAME and DISTRIBUTION_ID.
set -euo pipefail

image=$1
shift

invalidate() {
  local id
  id=$(aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths '/*' --query Invalidation.Id --output text)
  aws cloudfront wait invalidation-completed --distribution-id "$DISTRIBUTION_ID" --id "$id"
}

previous=
rollback() {
  local status=$?
  trap - EXIT
  if [ "$status" -ne 0 ] && [ -n "$previous" ]; then
    echo "deploy failed, pointing live back to version $previous" >&2
    # Best effort: keep going so the invalidation still runs.
    aws lambda update-alias --function-name "$FUNCTION_NAME" --name live --function-version "$previous" >/dev/null || true
    invalidate || true
  fi
  exit "$status"
}
trap rollback EXIT
# A build timeout or cancel sends TERM; exiting through the EXIT trap keeps an unverified version from staying live.
trap 'exit 143' TERM
trap 'exit 130' INT

aws lambda update-function-code --function-name "$FUNCTION_NAME" --image-uri "$image" >/dev/null
aws lambda wait function-updated-v2 --function-name "$FUNCTION_NAME"
version=$(aws lambda publish-version --function-name "$FUNCTION_NAME" --query Version --output text)
aws lambda wait function-updated-v2 --function-name "$FUNCTION_NAME" --qualifier "$version"

current=$(aws lambda get-alias --function-name "$FUNCTION_NAME" --name live --query FunctionVersion --output text)
# Set only once live is about to move, so a failure before that never rolls back.
previous=$current
aws lambda update-alias --function-name "$FUNCTION_NAME" --name live --function-version "$version" >/dev/null
invalidate

# Background plus wait lets a signal run the trap at once instead of after the verify command ends.
"$@" &
verify=$!
trap 'kill "$verify" 2>/dev/null || true; exit 143' TERM
trap 'kill "$verify" 2>/dev/null || true; exit 130' INT
wait "$verify"
