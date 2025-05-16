# Youtube Chat to Minecraft (YC2MC)

Youtube のライブ配信チャットを Minecraft サーバーのゲーム内チャットに転送するサービスです。

参加希望者管理の機能も含まれます。

## 機能

- Youtube ライブ配信のチャット監視
- チャットの Minecraft サーバーへの転送 
- 参加希望者の管理
  - 参加希望コメントの検出
  - チケットサーバー連携による ID 解決
  - ニックネームプラグイン連携によるニックネームの割り当て
- Web UI による管理（非モダンのため、フレームワークに入れ替え予定）
  - 複数のチャンネル管理
  - チャンネル単位に文字色設定あり
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

## 起動

```sh
cd docker
./run.sh
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
