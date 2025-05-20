#!/bin/sh

function debug() {
    trap 'exit 0' INT TERM
    echo "Entering infinite loop for debugging"
    while true; do
        sleep 1;
    done
}

chown -R node:node /app
su-exec node echo "Switch user to node"
if [ $? -ne 0 ] || [ -n "${DEBUG}" ]; then
    debug
fi

exec su-exec node "$@"
