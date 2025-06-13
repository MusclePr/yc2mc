#!/bin/bash
# 常にスクリプトのあるディレクトリで実行
cd "$(dirname "$0")"

source .env
trap ./down.sh INT TERM
if [ -e "./${SERVER1}/data/.stop-from-mcui" ]; then
  OPT=--no-start
  echo "no start"
  docker compose up -d --no-recreate ${OPT} && \
  docker compose start mcui && \
  docker compose logs -f && ./down.sh
else
  docker compose down
  docker compose build --build-arg DEBUG="${1}" ${BUILD_TARGET} && \
  docker compose up && ./down.sh
fi
