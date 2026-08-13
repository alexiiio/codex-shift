#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js 20 or later is required." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required." >&2
  exit 1
fi

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if (( node_major < 20 )); then
  echo "Error: Node.js 20 or later is required (found $(node --version))." >&2
  exit 1
fi

cd "${repo_root}"

echo "Installing project dependencies..."
# The source installer builds with tsc, so dependency lifecycle hooks are unnecessary here.
npm install --ignore-scripts --no-package-lock

echo "Checking and building Codex Shift..."
npm run check
npm run build

# Install from the built local package so the command is available outside this repository.
echo "Installing the codex-shift command globally..."
npm install --global "${repo_root}"

echo "Codex Shift installed successfully. Run: codex-shift --help"
