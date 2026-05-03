#!/bin/sh
devdir=$(dirname "$0")
cd "$devdir" || exit 1
docker compose exec -itu node node bash -c "cd /build && exec bash $@"
