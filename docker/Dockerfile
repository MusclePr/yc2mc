FROM node:lts-alpine
RUN apk -U --no-cache add tzdata bash
RUN apk -U --no-cache add docker-cli knock curl jq yq
ENV TZ=Asia/Tokyo
RUN adduser node ping
WORKDIR /app
COPY dist/index.js .
COPY src/assets/ ./assets/
COPY package.json yarn.lock ./
COPY node_modules/ ./node_modules/
COPY youtube-chat-*.tgz .
RUN yarn install --production --frozen-lockfile
RUN rm youtube-chat-*.tgz
USER node
ENTRYPOINT [ "node", "index" ]
