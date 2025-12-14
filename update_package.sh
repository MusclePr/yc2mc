#!/bin/bash
export NODE_OPTIONS=--no-deprecation
packages=(youtube-chat twitch-chat)

for p in "${packages[@]}"; do
    src="$(ls -1t ../${p}/${p}-*.tgz | head -n 1)"
    dst="./$(basename ${src})"
    
    # 既存のパッケージファイルと比較
    if [ ! -f "${dst}" ] || ! cmp -s "${src}" "${dst}"; then
        cp -auv "${src}" ./
        yarn remove "${p}"
        yarn add "file:${dst}"
    else
        echo "スキップ: ${p} (変更なし)"
    fi
done
