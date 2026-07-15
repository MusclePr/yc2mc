#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# Source to keep nvm-selected node/npm in this shell.
# shellcheck disable=SC1091
source ./scripts/ensure-node-env.sh
echo "依存関係を固定インストールします (npm ci)..."
npm ci
echo "TypeScript をビルドします..."
npm run build
