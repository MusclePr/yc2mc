#!/bin/sh

is_in_container() {
  [ -f /.dockerenv ] && return 0
  [ -f /run/.containerenv ] && return 0

  if [ -r /proc/1/cgroup ] && grep -Eq '(docker|containerd|kubepods|podman|lxc)' /proc/1/cgroup; then
    return 0
  fi

  return 1
}

if is_in_container; then
  tsc
else
  buildup_flag=
  if docker inspect node -f '{{.State.Status}}' 2>/dev/null | grep -q "running"; then
    echo "ビルド用コンテナは起動しています。"
  else
    echo "ビルド用コンテナをバックグラウンドで起動します。"
    devdir=$(dirname "$0")
    ${devdir}/buildup.sh
    buildup_flag=1
  fi
  echo "コンテナ内でビルドします。"
  docker exec -itu node node bash -c "cd /build && tsc"
  if [ $? -ne 0 ]; then
    echo "ビルドに失敗しました。"
    exit 1
  fi
  if [ -n "$buildup_flag" ]; then
    echo "ビルドが成功しました。コンテナを停止します。"
    ${devdir}/down.sh
  fi
fi
