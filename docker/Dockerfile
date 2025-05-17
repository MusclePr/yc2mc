FROM node:lts-alpine
# パッケージインストール
RUN apk -U --no-cache add tzdata bash su-exec
RUN apk -U --no-cache add docker-cli knock curl jq yq
# デフォルトのタイムゾーン。ENV定義は、実行時にオーバーライト可能。
ENV TZ=Asia/Tokyo
ENV NODE_OPTIONS=--no-deprecation
WORKDIR /app

COPY --chown=node:node package.json ./
COPY --chown=node:node youtube-chat-v2.2.0.tgz ./
COPY --chown=node:node twitch-chat-v1.0.0.tgz ./
RUN yarn install --production
RUN rm youtube-chat-*.tgz twitch-chat-*.tgz
RUN yarn cache clean

COPY --chown=node:node dist/index.js .
COPY --chown=node:node src/assets/ ./assets/

COPY --chown=node:node docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080
VOLUME [ "/config" ]
ENTRYPOINT [ "/entrypoint.sh", "node", "index" ]
