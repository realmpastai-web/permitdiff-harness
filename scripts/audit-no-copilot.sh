#!/bin/sh
# Fail if this repo installs, downloads, or executes @github/copilot.
set -eu

fail=0

echo "AUDIT package manifests"
if grep -n "@github/copilot" package.json package-lock.json; then
  echo "FAIL manifest references @github/copilot"
  fail=1
else
  echo "PASS manifest has no @github/copilot"
fi

echo "AUDIT Dockerfile"
if grep -nE 'npm[[:space:]]+(install|ci|i)[[:space:]].*@github/copilot|npx[[:space:]]+@github/copilot|copilot[[:space:]]+login' Dockerfile; then
  echo "FAIL Dockerfile installs or logs into Copilot"
  fail=1
else
  echo "PASS Dockerfile has no Copilot install or login"
fi

echo "AUDIT source execution"
if grep -nR -E 'spawn\(|execFile\(|execSync\(|exec\(' src | grep -i copilot; then
  echo "FAIL source executes copilot"
  fail=1
else
  echo "PASS source does not execute copilot"
fi

echo "AUDIT node_modules"
if [ -d node_modules/@github ]; then
  if find node_modules/@github -maxdepth 1 -type d -name 'copilot*' | grep -q .; then
    echo "FAIL @github/copilot is installed on disk"
    fail=1
  else
    echo "PASS node_modules/@github has no copilot package"
  fi
else
  echo "PASS node_modules/@github is absent"
fi

if [ "$fail" -ne 0 ]; then
  exit 1
fi

echo "PASS no @github/copilot install, download, or execution"
