FROM node:lts-alpine
# パッケージインストール
RUN apk -U --no-cache add tzdata musl-locales bash su-exec
RUN apk -U --no-cache add docker-cli knock curl jq yq
ARG DEBUG
ENV DEBUG=${DEBUG:-""}
ENV TZ=Asia/Tokyo
ENV LANG=ja_JP.UTF-8
ENV LC_ALL=ja_JP.UTF-8
ENV NODE_OPTIONS=--no-deprecation
WORKDIR /app

COPY --chown=node:node dist/index.js .
COPY --chown=node:node src/assets/ ./assets/
COPY --chown=node:node package.json ./
COPY --chown=node:node package-lock.json ./
COPY --chown=node:node scripts/ ./scripts/
COPY --chown=node:node youtube-chat-2.2.0.tgz ./
COPY --chown=node:node twitch-chat-1.0.0.tgz ./
RUN npm ci --omit=dev && rm -rf ./scripts
RUN rm -f package.json package-lock.json

COPY --chown=node:node docker/assets/entrypoint.sh .
RUN chmod +x ./entrypoint.sh
RUN mkdir -p /config
RUN chown node:node /app /config

EXPOSE 8080
VOLUME [ "/config" ]
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "index"]
HEALTHCHECK --interval=10s --timeout=1s --start-period=5s --retries=3 CMD [ "nc", "-z" , "localhost", "8080" ]
