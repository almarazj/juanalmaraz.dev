#!/usr/bin/env bash
# Usage: in-playwright.sh '<shell command>'
# Runs the command in the official Playwright image pinned to the repo's version, on the host network
# so it reaches the Docker services. Playwright's browsers need a supported Linux, which CodeBuild's is not.
set -euo pipefail

version=${PLAYWRIGHT_VERSION:-$(node -p "require('@playwright/test/package.json').version")}

exec docker run --rm --ipc=host --network host -v "$PWD:/work" -w /work \
  -e CI=true -e BASE_URL -e FUNCTION_URL -e EXPECTED_VERSION \
  "mcr.microsoft.com/playwright:v$version-noble" bash -c "$1"
