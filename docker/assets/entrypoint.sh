#!/bin/sh

function debug() {
    trap 'exit 0' INT TERM
    echo "Entering infinite loop for debugging"
    while true; do
        sleep 1;
    done
}

# Docker socket GID を動的に取得し、node ユーザーに権限付与
if [ -S /var/run/docker.sock ]; then
    DOCKER_GID=$(stat -c %g /var/run/docker.sock)
    
    # グループが存在しない場合は作成
    if ! getent group $DOCKER_GID > /dev/null 2>&1; then
        addgroup -g $DOCKER_GID dockergrp 2>/dev/null || true
    fi
    
    # node ユーザーをグループに追加
    DOCKER_GROUP=$(getent group $DOCKER_GID | cut -d: -f1)
    if [ -n "$DOCKER_GROUP" ]; then
        addgroup node $DOCKER_GROUP 2>/dev/null
    fi
fi

su-exec node echo "Switch user to node"
if [ $? -ne 0 ] || [ -n "${DEBUG}" ]; then
    debug
fi

exec su-exec node "$@"
