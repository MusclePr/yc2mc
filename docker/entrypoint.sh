#!/bin/sh
chown -R node:node /config
su-exec node:node echo "Switch user to node"
if [ $? -ne 0 ] || [ "${1}" = "debug" ]; then
    # halt
    trap 'exit 0' INT TERM
    echo "Entering infinite loop for debugging"
    while true; do
        sleep 1;
    done
fi
exec su-exec node:node "$@"
