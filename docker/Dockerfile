FROM node:lts-alpine
# パッケージインストール
RUN apk -U --no-cache add tzdata bash su-exec
RUN apk -U --no-cache add docker-cli knock curl jq yq
# デフォルトのタイムゾーン。ENV定義は、実行時にオーバーライト可能。
ENV TZ=Asia/Tokyo
WORKDIR /app
COPY --chown=node:node dist/index.js .
COPY --chown=node:node src/assets/ ./assets/
COPY --chown=node:node package.json yarn.lock ./
COPY --chown=node:node node_modules/ ./node_modules/
COPY --chown=node:node youtube-chat-*.tgz .
COPY --chown=node:node docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
RUN yarn install --production --frozen-lockfile
RUN rm youtube-chat-*.tgz
EXPOSE 8080
VOLUME [ "/config" ]
ENTRYPOINT [ "/entrypoint.sh", "node", "index" ]
