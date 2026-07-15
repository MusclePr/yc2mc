#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NVMRC_PATH="${ROOT_DIR}/.nvmrc"
MIN_NODE_MAJOR=24
MIN_NPM_MAJOR=10

load_nvm() {
  if command -v nvm >/dev/null 2>&1; then
    return 0
  fi

  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "${NVM_DIR}/nvm.sh" ]; then
    # shellcheck disable=SC1090
    . "${NVM_DIR}/nvm.sh"
    return 0
  fi

  return 1
}

if [ -f "${NVMRC_PATH}" ]; then
  if load_nvm; then
    nvm use >/dev/null
  fi
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] node コマンドが見つかりません。Node.js をインストールしてください。" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[ERROR] npm コマンドが見つかりません。Node.js に同梱された npm を利用してください。" >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
NPM_MAJOR="$(npm -v | cut -d. -f1)"

if [ "${NODE_MAJOR}" -lt "${MIN_NODE_MAJOR}" ]; then
  echo "[ERROR] Node.js ${MIN_NODE_MAJOR}+ が必要です。現在: $(node -v)" >&2
  if [ -f "${NVMRC_PATH}" ]; then
    echo "        対処: nvm install && nvm use" >&2
  fi
  exit 1
fi

if [ "${NPM_MAJOR}" -lt "${MIN_NPM_MAJOR}" ]; then
  echo "[ERROR] npm ${MIN_NPM_MAJOR}+ が必要です。現在: $(npm -v)" >&2
  exit 1
fi

echo "[OK] Node: $(node -v) / npm: $(npm -v)"