#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Source to keep nvm-selected node/npm in this shell.
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/scripts/ensure-node-env.sh"

export NODE_OPTIONS=--no-deprecation
packages=(youtube-chat twitch-chat)

for p in "${packages[@]}"; do
    src="$(ls -1t ../${p}/${p}-*.tgz | head -n 1)"
    dst="./$(basename ${src})"
    
    # 既存のパッケージファイルと比較
    if [ ! -f "${dst}" ] || ! cmp -s "${src}" "${dst}"; then
        cp -auv "${src}" ./
        # package.json に存在する場合のみ削除
        if grep -q "\"${p}\":" package.json; then
            npm uninstall "${p}"
        fi
        npm install "file:${dst}"
    else
        echo "スキップ: ${p} (変更なし)"
    fi
done
