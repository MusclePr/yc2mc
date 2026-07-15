#!/bin/bash

#---------------------------------------------------------
# ヘルパー関数群
#---------------------------------------------------------

# 初期化
function clean()
{
    # Velocity/Paper の初期化
    echo "Cleaning up ..."
    docker compose down
    rm -rf lobby ${SERVER1} proxy
    ./updatePlugins.sh clean
    rm -rf assets/proxy assets/${SERVER1}
    echo "done."
}

# 必要ツールのインストール確認
function checkTools()
{
    # docker のインストール確認
    docker --version > /dev/null 2>&1
    if [ $? -ne 0 ]; then
        echo "docker engine is not installed. Please install docker engine."
        echo "https://docs.docker.com/engine/install/"
        exit 1
    fi

    # docker compose のインストール確認
    docker compose version > /dev/null 2>&1
    if [ $? -ne 0 ]; then
        echo "docker compose is not installed. Please install docker compose."
        echo "https://docs.docker.com/compose/install/"
        exit 1
    fi

    # yq のインストール確認
    yq --version > /dev/null 2>&1
    if [ $? -ne 0 ]; then
        echo "yq is not installed. Please install yq."
        echo "https://github.com/mikefarah/yq/"
        echo "sudo snap install yq"
        exit 1
    fi

    # unzip のインストール確認
    unzip -v > /dev/null 2>&1
    if [ $? -ne 0 ]; then
        echo "unzip is not installed. Please install unzip."
        echo "sudo apt install unzip"
        exit 1
    fi
}

# 起動後に作成される proxy/data/velocity.toml の内容を更新する
function Proxy_updateConfig()
{
    local -r CONFIG="proxy/data/velocity.toml"

    # 最新の初期状態に戻す場合
    #curl -sLo "${CONFIG}" "https://github.com/PaperMC/Velocity/raw/refs/heads/dev/3.0.0/proxy/src/main/resources/default-velocity.toml"

    # player-info-forwarding-mode を "modern" に変更
    sed -i -E 's/^(player-info-forwarding-mode\s*=\s*).*$/\1"modern"/' "${CONFIG}"

    # いらないサーバーの削除
    sed -i -E '/^(factions|minigames)\s*=/d' "${CONFIG}"
    sed -i -E '/^"(factions|minigames)\.example\.com"/,/\]/d' "${CONFIG}"

    # [servers] セクションの変更
    sed -i -E "s/^lobby = \"127.*/lobby = \"mc-lobby\"\n${SERVER1} = \"mc-${SERVER1}\"/" "${CONFIG}"
}

# コンテナの状態を取得するヘルパー関数
function Docker_getFullStatus()
{
    local -r CONTAINER_NAME=${1:-mc-proxy}
    local -r STATUS=$(docker inspect -f '{{.State.Status}}' ${CONTAINER_NAME})
    local -r HEALTHY=$(docker inspect -f '{{.State.Health.Status}}' ${CONTAINER_NAME})
    echo "${STATUS} ${HEALTHY}"
}

# コンテナの状態が目標の状態になるまで待機するヘルパー関数
function Docker_waitFullStatus()
{
    local -r CONTAINER_NAME=${1:-mc-proxy}
    local -r TARGET_STATUS=${2:-running healthy}
    local -r TIMEOUT=${3:-60}
    local -r INTERVAL=${4:-5}
    local -r START_TIME=$(date +%s)
    local -r END_TIME=$((START_TIME + TIMEOUT))

    while true; do
        local STATUS=$(Docker_getFullStatus ${CONTAINER_NAME})
        if [ "${STATUS}" = "${TARGET_STATUS}" ]; then
            echo "Container ${CONTAINER_NAME} is ${TARGET_STATUS}."
            return 0
        fi

        local CURRENT_TIME=$(date +%s)
        if [ ${CURRENT_TIME} -ge ${END_TIME} ]; then
            echo "Container ${CONTAINER_NAME} is not ${TARGET_STATUS} after ${TIMEOUT} seconds."
            #return 1
            exit 1 # force exit
        fi

        sleep ${INTERVAL}
    done
}

# AdvancedPortals プラグイン用の設定ファイルを生成する関数
function Lobby_addAdvancedPortalData()
{
    TARGET_BASE="./lobby/data/plugins/AdvancedPortals"
    mkdir -p "${TARGET_BASE}/desti"
    mkdir -p "${TARGET_BASE}/portals"
    cat - << EOL > "${TARGET_BASE}/desti/${SERVER1}.yaml"
args:
  name:
  - ${SERVER1}
loc:
  pitch: 1.0
  worldName: lobby
  x: 2.5
  y: 0.0
  yaw: 180.0
  z: 2.5
EOL
    cat - << EOL > "${TARGET_BASE}/portals/${SERVER1}.yaml"
args:
  bungee:
  - ${SERVER1}
  name:
  - ${SERVER1}
  destination:
  - ${SERVER1}
  triggerblock:
  - NETHER_PORTAL
maxLoc:
  posX: 3
  posY: 2
  posZ: 0
  worldName: lobby
minLoc:
  posX: 1
  posY: 0
  posZ: 0
  worldName: lobby
EOL
}

# Spigot の設定ファイルを更新する関数
# 対象ファイル：${1}/data/spigot.yml
#settings:
#  bungeecord: <true | false>
function setupSpigotForBungeecord()
{
    local -r CONFIG=${1:-.}/data/spigot.yml
    if [ ! -f ${CONFIG} ]; then
        echo "${CONFIG} does not found."
        return 1
    fi
    echo "update ... <$CONFIG>"

    yq -i ".settings.bungeecord = ${bungeecord}" ${CONFIG}

    # 確認のための表示
    echo -e "\e[36msettings:"
    echo -en "  bungeecord: \e[35m"
    cat ${CONFIG} | yq '.settings.bungeecord'
    echo -en "\e[0m"
    return 0
}

# Paper の設定ファイルを更新する関数
# 対象ファイル：${1}/data/config/paper-global.yml
#proxies:
#  bungee-cord:
#    online-mode: true
#  proxy-protocol: false
#  velocity:
#    enabled: <true | false>
#    online-mode: true
#    secret: '<SECRET>'
function setupPaperForVelocity()
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

    # 確認のための表示
    echo -e "\e[36mproxies:\e[0m"
    cat ${CONFIG} | yq -C '.proxies' | sed -re 's/^/  /'
    return 0
}

#==========================================================================
# マインクラフトサーバーを初期化するためのメイン処理
#==========================================================================

# 常にスクリプトのあるディレクトリで実行
cd "$(dirname "$0")"

#
# .env が未生成なら、.env.sample をコピーして生成します。
#
if [ ! -f .env ]; then
    cp .env.sample .env
    echo 'copy ".env.sample" ---> ".env"'
    echo 'You can custom ".env" file.'
    echo '----------------------'
    cat .env
    echo '----------------------'
    exit 0
fi

#
# .env ファイルの読み込みと必須変数のチェック
#
source .env
if [ -z "${SERVER1}" ]; then
    echo "Please set SERVER1 in .env file."
    exit 1
fi
if [ -z "${BUILD_TARGET}" ]; then
    echo "Please set BUILD_TARGET in .env file."
    exit 1
fi

#
# コマンドオプションをチェック
#
if [ "${1}" = "clean" ]; then
    clean
    exit 0
elif [ "${1}" != "setup" ]; then
    echo "Usage: $(basename ${0}) [clean|setup]"
    echo "  clean ... remove all data"
    echo "  setup ... setup config files"
    exit 0
fi

#
# 必要なツールがインストールされているかチェック
#
checkTools

#
# 古いコンテナが残っていたら除去
#
docker compose down

#
# 必須ファイルや data ディレクトリが１つでも無い場合は、初回セットアップとして作成します。
#
if [ ! -f proxy/data/forwarding.secret ] || [ ! -d lobby/data ] || [ ! -d ${SERVER1}/data ]; then
    clean # 中途半端な状態を消す

    echo "Setting up ..."

    mkdir -p proxy/data lobby/data ${SERVER1}/data ${SERVER1}/live ${SERVER1}/plugins

    # プラグインの更新
    ./updatePlugins.sh

    # Docker イメージのビルド
    docker compose build ${BUILD_TARGET} || exit 1

    # コンテナの作成（まだ起動しない）
    docker compose create || exit 1

    # mc-proxy, mc-lobby, mc-server1 サービスのみを開始
    docker compose start mc-proxy mc-lobby mc-server1

    # mc-proxy の起動完了待ち（設定ファイルの生成完了待ち）
    echo "waiting healthy for mc-proxy"
    Docker_waitFullStatus mc-proxy "running healthy"

    # mc-lobby の起動完了待ち（設定ファイルの生成完了待ち）
    echo "waiting healthy for mc-lobby"
    Docker_waitFullStatus mc-lobby "running healthy"
    # mc-lobby の PlaceholderAPI に追加の Expansion をダウンロードします。
    docker exec -it mc-lobby rcon-cli papi ecloud download Player
    sleep 1
    docker exec -it mc-lobby rcon-cli papi ecloud download String
    sleep 1
    if [ -n "${OP_USER}" ]; then
        docker exec -it mc-lobby rcon-cli op ${OP_USER}
    fi

    # mc-server1 の起動完了待ち（設定ファイルの生成完了待ち）
    echo "waiting mc-${SERVER1} for mc-server1"
    Docker_waitFullStatus mc-${SERVER1} "running healthy"
    if [ -n "${OP_USER}" ]; then
        docker exec -it mc-${SERVER1} rcon-cli op ${OP_USER}
    fi

    # 終了
    docker compose down

    # mc-proxy の設定ファイルを更新
    Proxy_updateConfig

    # AdvancedPortal のプラグインに server1 用のテレポート設定を追加する
    Lobby_addAdvancedPortalData
fi

#
# ここからは、すでにコンテナが一度起動・終了して必要な設定ファイルが作成されている前提で設定を行います。
#
if [ -f proxy/data/forwarding.secret ]; then
    SECRET=$(cat proxy/data/forwarding.secret)
fi

if [ -z "${SECRET}" ]; then
    echo "proxy (Velocity) が forwarding.secret の生成に失敗しています。"
    exit 1
fi

#
# Velocity の動作モードを設定します
#
bungeecord=false
velocity=true

# すべての Minecraft サーバーに対し、プロキシーから接続できるように設定を行う
for s in lobby ${SERVER1}; do
    setupSpigotForBungeecord ${s} && setupPaperForVelocity ${s} || exit 1
done
