# Youtube Chat to Minecraft (YC2MC)

Youtube のライブ配信チャットを Minecraft サーバーのゲーム内チャットに転送するサービスです。

参加希望者管理の機能も含まれます。

## 機能

- Youtube ライブ配信のチャット監視
- チャットの Minecraft サーバーへの転送 
- 参加希望者の管理
  - 参加希望コメントの検出
  - プレイヤー名の管理
  - ニックネームの自動設定
- Web UI による管理
  - ライブ配信の監視開始/停止
  - 参加希望者の承認/拒否
  - 参加希望者リストの管理

## 必要要件

- Docker
- Docker Compose
- Node.js v16以上
- Minecraft サーバー (Paper)
- 以下のプラグイン:
  - ProtocolLib
  - NickAfkPartyPack

## イメージのビルド

```sh
# リポジトリをクローン
git clone https://github.com/MusclePr/yc2mc

# 依存パッケージをインストール
yarn install

# ビルド
yarn build

# Docker イメージをビルド
cd docker
./publish.sh
```

## 設定

[`docker/docker-compose.yml`](docker/docker-compose.yml ) の環境変数で設定を行います:

```yml
environment:
  # Youtube Channel ID または @handle
  CHANNEL_ID: "@username"
  
  # Minecraft サーバー接続設定  
  RCON_HOST: "mc"
  RCON_PORT: 25575
  RCON_PASSWORD: "minecraft"
  
  # その他設定
  MC_YOUTUBE_NAME_COLOR: "blue" # Youtube名の表示色
```

## 起動

```sh
cd docker
./up.sh
```

Web UI: http://localhost:8080

## 作者

MusclePr

## ライセンス

このプロジェクトは独自ライセンスの下で提供されています。
