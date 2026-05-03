#!/bin/bash
devdir=$(dirname "$0")
cd "$devdir" || exit 1
docker compose down
