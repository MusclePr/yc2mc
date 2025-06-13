#!/bin/sh
# 常にスクリプトのあるディレクトリで実行
cd "$(dirname "$0")"
docker compose down
