#!/bin/bash
# 常にスクリプトのあるディレクトリで実行
cd "$(dirname "$0")"
source .env
docker compose build ${BUILD_TARGET}
