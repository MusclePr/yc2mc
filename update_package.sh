#!/bin/bash
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
            yarn remove "${p}"
        fi
        yarn add "file:${dst}"
    else
        echo "スキップ: ${p} (変更なし)"
    fi
done
