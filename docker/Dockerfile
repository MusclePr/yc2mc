FROM node:lts-alpine
# パッケージインストール
RUN apk -U --no-cache add tzdata musl-locales bash su-exec
RUN apk -U --no-cache add docker-cli knock curl jq yq
# dockerグループ(GID:999)として、nodeユーザーを追加 (alpineのGID:999は、pingグループ)
RUN adduser node ping
ARG DEBUG
ENV DEBUG=${DEBUG:-""}
ENV TZ=Asia/Tokyo
ENV LANG=ja_JP.UTF-8
ENV LC_ALL=ja_JP.UTF-8
ENV NODE_OPTIONS=--no-deprecation
WORKDIR /app

COPY dist/index.js .
COPY src/assets/ ./assets/
COPY package.json ./
COPY youtube-chat-v2.2.0.tgz ./
COPY twitch-chat-v1.0.0.tgz ./
RUN yarn install --production
RUN yarn cache clean
RUN rm -f package.json yarn.lock

COPY docker/assets/entrypoint.sh .
RUN chmod +x ./entrypoint.sh

EXPOSE 8080
VOLUME [ "/config" ]
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "index"]
HEALTHCHECK --interval=10s --timeout=1s --start-period=5s --retries=3 CMD [ "nc", "-z" , "localhost", "8080" ]
