#!/bin/bash

set -e

#---------------------------------------------------------
# ヘルパー関数群
#---------------------------------------------------------

# github.com から最終リリースのURLを探す
# Github_getLatestUrl <リポジトリ> <パターン>
function Github_getLatestUrl()
{
    local -r REPO="${1}"
    local -r PAT="${2:-\.jar}"
    local -r URL=$(curl -s "https://api.github.com/repos/${REPO}/releases/latest" | jq -r '.assets[].browser_download_url' | grep "${PAT}" | head -n 1)
    if [ -z "${URL}" ]; then
        echo "最新バージョンが見つかりません：https://github.com/${REPO}"
        exit 1 # abort
    fi
    echo "${URL}"
}

# Download <URL> <出力パス>
function Download()
{
    local -r SRC="${1}"
    local -r DST="${2}"
    local -a OPTS=()
    # 出力ファイルが存在していたら、タイムスタンプ比較を行い、必要に応じてダウンロードする
    if [ -f "${DST}" ]; then
        OPTS=("-z" "${DST}")
        echo -n "Check & "
    fi
    echo "Download: ${SRC}"
    curl -sRL "${SRC}" -o "${DST}" ${OPTS[*]}
    local -i -r fsize="$(stat -c %s ${DST})"
    if [ ${fsize} -lt 64 ]; then
        cat "${DST}"
        echo ""
        rm "${DST}"
        return 1
    fi
    if ! unzip -t "${DST}" > /dev/null; then
        echo "${DST} does not jar"
        rm "${DST}"
        return 1
    fi
    return 0
}

function DownloadFromModrinth()
{
    # Modrinth API のベース URL
    local -r MODRINTH_API="https://api.modrinth.com/v2/project"
    # ダウンロードするプラグインの ID（Modrinth の URL から取得可能）
    local -a PLUGINS=($@) OPTS
    local PLUGIN VERSION_ID DOWNLOAD_URL DST
    for PLUGIN in "${PLUGINS[@]}"; do
        echo "Modrinth から $PLUGIN の最新バージョンを取得しています..."
        # 最新のバージョン情報を取得
        VERSION_ID=$(curl -s "${MODRINTH_API}/${PLUGIN}/version" | jq -r '.[0].id')
        if [ -n "${VERSION_ID}" ]; then
            # ダウンロード URL を取得
            DOWNLOAD_URL=$(curl -s "${MODRINTH_API}/${PLUGIN}/version/${VERSION_ID}" | jq -r '.files[0].url')
            if [ -n "${DOWNLOAD_URL}" ]; then
                DST="${DEST_DIR}/$(basename ${DOWNLOAD_URL})"
                # 出力ファイルが存在していたら、タイムスタンプ比較を行い、必要に応じてダウンロードする
                OPTS=()
                if [ -f "${DST}" ]; then
                    OPTS=("-z" "${DST}")
                    echo -n "Check & "
                fi
                echo "Download: ${DST}"
                curl -sRL "${DOWNLOAD_URL}" -o "${DST}" ${OPTS[*]}
            else
                echo "${PLUGIN} のダウンロード URL を取得できませんでした。"
            fi
        else
            echo "${PLUGIN} の最新バージョン情報を取得できませんでした。"
        fi
    done
}

function DownloadFromSpigot()
{
    # SpigotMC のプラグインページ URL（プラグイン ID を指定）
    local -r SPIGOT_V01_API="https://api.spigotmc.org/simple/0.1/index.php?action=getResource&id=${1}"
    #SPIGOT_V2_API="https://api.spiget.org/v2/resources/${1}/versions/latest"

    echo "SpigotMC からプラグインの最新バージョンを取得しています..."
    local -r TITLE=$(curl -sL "${SPIGOT_V01_API}" | jq -r '.title')
    # ダウンロード URL を取得
    #VERSION=$(curl -sL "${SPIGOT_V01_API}" | jq -r '.current_version')
    local -r DOWNLOAD_URL="https://api.spiget.org/v2/resources/${1}/download"

    if [ -n "${DOWNLOAD_URL}" ]; then
        local -r DST="${DEST_DIR}/${TITLE}.jar"
        # 出力ファイルが存在していたら、タイムスタンプ比較を行い、必要に応じてダウンロードする
        local -a OPTS=()
        if [ -f "${DST}" ]; then
            OPTS=("-z" "${DST}")
            echo -n "Check & "
        fi
        echo "Download: ${DST}"
        curl -sRL "${DOWNLOAD_URL}" -o "${DST}" ${OPTS[*]}
    else
        echo "プラグインの URL を取得できませんでした。"
    fi
}

function RemoveOldFiles()
{
    local -r DIR="${1}"
    local -r PREFIX="${2}"
    local -r KEEP="${3:-1}"
    local FILES
    # 先頭の最新のファイルだけ残して、あとは削除
    # tail -n +X は X 行目以降を出力する
    FILES=$(ls -1t ${DIR}/${PREFIX}* 2> /dev/null | tail -n +$((KEEP + 1)))
    if [ -n "${FILES}" ]; then
        echo "Removing old files:"
        echo "${FILES}"
        rm -v ${FILES}
    fi
}

#==========================================================================
# メイン処理
#==========================================================================

# 常にスクリプトのあるディレクトリで実行
cd "$(dirname "$0")"

if [ ! -f .env ]; then
    echo ".env file was not found."
    exit 1
fi

source .env

# ダウンロード先ディレクトリ
DEST_DIR="./plugins"

# 初期化の場合
if [ "${1}" = "clean" ]; then
    LIST=$(ls -1 assets/*/plugins/*.jar 2> /dev/null)
    if [ -n "${LIST}" ]; then
        rm -vf ${LIST}
        # 空ディレクトリの子ディレクトリをすべて削除する
        find assets -type d -empty -delete
    fi
    exit 0
fi

#
# ダウンロード処理（proxy 用）
#
DEST_DIR="assets/proxy/plugins"
mkdir -p "${DEST_DIR}"
# 最新の ViaVersion のダウンロード URL を取得
URL=$(Github_getLatestUrl ViaVersion/ViaVersion ViaVersion-.*\.jar)
Download "${URL}" "${DEST_DIR}/ViaVersion.jar"
# 最新の ViaBackwards のダウンロード URL を取得
URL=$(Github_getLatestUrl ViaVersion/ViaBackwards ViaBackwards-.*\.jar)
Download "${URL}" "${DEST_DIR}/ViaBackwards.jar"
# 統合版のためのプラグイン
Download "https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/velocity" "${DEST_DIR}/Geyser-Velocity.jar"
Download "https://download.geysermc.org/v2/projects/floodgate/versions/latest/builds/latest/downloads/velocity" "${DEST_DIR}/floodgate-velocity.jar"
DownloadFromModrinth advanced-portals
RemoveOldFiles "${DEST_DIR}" "Advanced-Portals"

#
# ダウンロード処理（lobby 用）
#
DEST_DIR="assets/lobby/plugins"
mkdir -p "${DEST_DIR}"
Download "https://github.com/dmulloy2/ProtocolLib/releases/download/dev-build/ProtocolLib.jar" "${DEST_DIR}/ProtocolLib.jar"
DownloadFromModrinth simplescoreboard multiverse-core
# https://www.spigotmc.org/resources/placeholderapi.6245/
DownloadFromSpigot 6245
SRC_FILE=$(ls -1t assets/proxy/plugins/Advanced-Portals*.jar 2> /dev/null | head -n 1)
cp -auv "${SRC_FILE}" "${DEST_DIR}/${SRC_FILE##*/}"
RemoveOldFiles "${DEST_DIR}" "Advanced-Portals"
RemoveOldFiles "${DEST_DIR}" "SimpleScoreBoard"
RemoveOldFiles "${DEST_DIR}" "multiverse-core"

#
# ダウンロード処理（server1 用）
#
DEST_DIR="assets/${SERVER1}/plugins"
mkdir -p "${DEST_DIR}"
# 依存関係上必要なプラグイン
cp -auv "assets/lobby/plugins/ProtocolLib.jar" "${DEST_DIR}/ProtocolLib.jar"

# ニックネームプラグイン
SRC_FILE=~/dev/NicknameRequired/build/libs/NicknameRequired-1.0-SNAPSHOT.jar
if [ -f "${SRC_FILE}" ]; then
    echo "NicknameRequired.jar found in local, copying to ${DEST_DIR}"
    cp -v "${SRC_FILE}" "${DEST_DIR}/NicknameRequired.jar"
else
    URL=$(Github_getLatestUrl MusclePr/NicknameRequired NicknameRequired-.*\.jar)
    Download "${URL}" "${DEST_DIR}/NicknameRequired.jar"
fi
# 権限管理プラグイン
# https://www.spigotmc.org/resources/luckperms.28140/
DownloadFromSpigot 28140
