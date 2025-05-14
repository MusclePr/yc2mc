#!/bin/bash

# 最新のオリジナルの設定ファイルを元に、config/velocity.toml を更新するスクリプト

ORIGINAL_DEFAULT_CONFIG_URL="https://github.com/PaperMC/Velocity/raw/refs/heads/dev/3.0.0/proxy/src/main/resources/default-velocity.toml"
CONFIG="config/velocity.toml"

# デフォルト設定からコピーを作成
curl -sLo "${CONFIG}" "${ORIGINAL_DEFAULT_CONFIG_URL}"

# player-info-forwarding-mode を "modern" に変更
sed -i -E 's/^(player-info-forwarding-mode\s*=\s*).*$/\1"modern"/' "${CONFIG}"

# いらないサーバーの削除
sed -i -E '/^(factions|minigames)\s*=/d' "${CONFIG}"
sed -i -E '/^"(factions|minigames)\.example\.com"/,/\]/d' "${CONFIG}"

# [servers] セクションの変更
sed -i -E 's/^lobby =.*/lobby = "mc-lobby"\nserver-1 = "mc-server-1"/' "${CONFIG}"
