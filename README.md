# Youtube Chat to Minecraft (YC2MC)

Youtube のライブ配信チャットを Minecraft サーバーのゲーム内チャットに転送するサービスです。

参加希望者管理の機能も含まれます。

## 機能

- Youtube ライブ配信のチャット監視
  - Twitch にも対応
- ライブ配信のチャットを Minecraft サーバーのチャットへ転送 
- 参加希望者の管理
  - ライブ配信のチャットから参加希望コメントの検出
  - チケットサーバー連携による ID 解決（チケット（UUID末尾４桁）からMCIDに変換するサービス）
  - ニックネームプラグイン連携によるニックネームの割り当て
- Web UI による管理
  - 複数の配信チャンネル管理（Youtube, Twitch 混在あり）
    - 配信チャンネル単位に文字色設定あり
    - 配信チャンネルからライブ配信の監視開始/停止
  - 参加希望者リストの管理
    - 参加希望者の追加・削除・承認/拒否
  - ホワイトリスト連動機能
    - Youtube の配信のタイトルに以下が含まれているとホワイトリスト機能を配信と連動してOFF/ONします。
      1. `Minecraft` または `マインクラフト` または `マイクラ`
      2. `参加型` または `参加可`

## 必要要件

- Docker … コンテナ制御
- Docker Compose … コンテナ連携制御
- Node.js v24以上 … JavaScript 実行環境
  - `nvm install --lts`
- Minecraft サーバー (Paper)
  - 必須プラグイン
    - NicknameRequired … サーバーへの接続時に、ニックネームの登録が無ければ、KICKするプラグイン
      - ProtocolLib（推奨）

## イメージのビルド

```sh
# リポジトリをクローン
git clone https://github.com/MusclePr/yc2mc.git

# 依存パッケージをインストール
yarn install

# ビルド
yarn run build

# Docker 環境の初期化
cd docker
./init.sh clean
./init.sh setup
```

## 設定

[`docker/docker-compose.yml`](docker/docker-compose.yml ) の環境変数で設定を行います:

```yml
environment:
  # Minecraft サーバー接続設定  
  RCON_HOST: "mc"
  RCON_PORT: 25575
  RCON_PASSWORD: "AdminPassword"
```

## Docker イメージの起動

```sh
cd docker
./up.sh
```

Web UI: http://localhost:8080

## ビルド＆起動

```sh
yarn run start
```

## 作者

MusclePr

## ライセンス

このプロジェクトは独自ライセンスの下で提供されています。
