#!/bin/bash

#
# マインクラフトのサーバーを初期化するためのスクリプト
#

yq --version > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "yq is not installed. Please install yq."
    echo "https://github.com/mikefarah/yq/"
    exit 1
fi

docker compose down
rm -rf lobby/data server-1/data proxy/data

#
# docker-compose.yml の volumes に指定しているため、root で作成されてしまう前に作成しておきます。
#
#NICK_DIR=server-1/data/plugins/NickAfkPartyPack
#mkdir -p ${NICK_DIR}
#echo "players:" > ${NICK_DIR}/nicknames.yml

# SETUP_ONLY=true で、必要な設定ファイルだけ作成して終了させます。
# ただし、mc-proxy だけ SETUP_ONLY に対応していないため、
# config/velocity.toml を modern に書き換えておく事で、
# 対応する forwarding.secret が無い事により、起動にわざと失敗させます。
SETUP_ONLY=true docker compose up --build
while true; do
    STATUS=$(docker inspect -f '{{.State.Status}}' mc-proxy)
    if [ "${STATUS}" = "exited" ]; then
        break
    fi
    sleep 1
done
docker compose down

#
# forwarding.secret の生成
#
if [ ! -f proxy/data/forwarding.secret ]; then
    SECRET=$(openssl rand -hex 16)
    echo "${SECRET}" > proxy/data/forwarding.secret
fi

bungeecord=false
velocity=true

#<data/spigot.yml>
#
#settings:
#  bungeecord: true
set_bungeecord()
{
    local -r CONFIG=${1:-.}/data/spigot.yml
    if [ ! -f ${CONFIG} ]; then
        echo "${CONFIG} does not found."
        return 1
    fi
    echo "update ... <$CONFIG>"

    sed -r \
        -e "s/(bungeecord:)\\s*\\w+/\\1 ${bungeecord}/" \
        -i ${CONFIG}

    yq '.settings.bungeecord' < ${CONFIG}
    return 0
}

#<data/config/paper-global.yml>
#proxies:
#  bungee-cord:
#    online-mode: true
#  proxy-protocol: false
#  velocity:
#    enabled: false
#    online-mode: true
#    secret: '<SECRET>'
set_velocity()
{
    local -r CONFIG=${1:-.}/data/config/paper-global.yml
    if [ ! -f ${CONFIG} ]; then
        echo "${CONFIG} does not found."
        return 1
    fi
    echo "update ... <$CONFIG>"

    read SECRET < proxy/data/forwarding.secret

    cat ${CONFIG} | \
    yq '.proxies."bungee-cord"."online-mode" = true' | \
    yq '.proxies."proxy-protocol" = false' | \
    yq ".proxies.velocity.enabled = ${velocity}" | \
    yq '.proxies.velocity."online-mode" = true' | \
    yq ".proxies.velocity.secret = \"${SECRET}\"" \
    > ${CONFIG}

    yq '.proxies' < ${CONFIG}
    return 0
}

for server in lobby server-1; do
    if [ ! -d ${server}/data ]; then
        echo "${server}/data does not found."
        exit 1
    fi
    set_bungeecord ${server} && set_velocity ${server} || exit 1
done

#
# .env が未生成なら、.env.sample をコピーして生成します。
#
if [ ! -f .env ]; then
    cp .env.sample .env
    echo ".env.sample -> .env"
    echo "Please edit .env"
fi

