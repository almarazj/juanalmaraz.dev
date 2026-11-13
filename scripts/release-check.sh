#!/usr/bin/env bash
# Fails unless HEAD carries exactly one v* tag equal to v + package.json version and is on origin/main.
# Runs in the current directory (the repo root). Prints the tag on stdout so the build can capture it.
set -euo pipefail

tags=$(git tag --points-at HEAD --list 'v*')
case "$tags" in
  '') echo "no v* tag points at HEAD" >&2; exit 1 ;;
  *$'\n'*) echo "more than one v* tag points at HEAD: $(echo "$tags" | tr '\n' ' ')" >&2; exit 1 ;;
esac

version=$(node -p "require('./package.json').version")
if [ "$tags" != "v$version" ]; then
  echo "tag $tags does not match package.json $version" >&2
  exit 1
fi

git rev-parse --verify -q refs/remotes/origin/main >/dev/null \
  || git fetch --quiet origin +refs/heads/main:refs/remotes/origin/main
if ! git merge-base --is-ancestor HEAD origin/main; then
  echo "tagged commit is not on main" >&2
  exit 1
fi

echo "$tags"
