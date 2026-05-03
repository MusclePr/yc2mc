# これはnodeアプリケーションを開発するための仮想開発環境です。
# 常に最新環境にするため、イメージを再ビルドしてから起動することを推奨。
# docker compose up --build -d
FROM node:lts
RUN set -eux; \
  apt-get update; \
  apt-get install -y --no-install-recommends ca-certificates curl gnupg; \
  install -m 0755 -d /etc/apt/keyrings; \
  curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg; \
  chmod a+r /etc/apt/keyrings/docker.gpg; \
  . /etc/os-release; \
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list; \
  apt-get update; \
  apt-get install -y --no-install-recommends \
    bash \
    coreutils \
    curl \
    docker-buildx-plugin \
    docker-ce-cli \
    docker-compose-plugin \
    git \
    jq \
    openssl \
    tar \
    tzdata \
    yq \
    zstd; \
  rm -rf /var/lib/apt/lists/*
ENV TZ=Asia/Tokyo
RUN npm install -g npm@latest
RUN npm upgrade -g yarn
RUN npm install -g js-yaml
RUN npm install -g axios
RUN npm install -g --save-dev typescript
RUN npm install -g --save-dev @types/node
RUN npm install -g --save-dev @types/express
RUN npm install -g --save-dev @js-temporal/polyfill
RUN npm install -g --save-dev @types/js-yaml
RUN npm install -g --save-dev @types/node-fetch@2
#RUN npm install youtube-chat
#RUN npm install rcon-client

RUN set -eux; \
  if [ -f /usr/lib/git-core/git-sh-prompt ]; then \
    cp /usr/lib/git-core/git-sh-prompt /home/node/.git-prompt.sh; \
  elif [ -f /usr/share/git-core/contrib/completion/git-prompt.sh ]; then \
    cp /usr/share/git-core/contrib/completion/git-prompt.sh /home/node/.git-prompt.sh; \
  fi; \
  if [ -f /home/node/.git-prompt.sh ]; then chown node:node /home/node/.git-prompt.sh; fi; \
  cat <<'EOF' >> /home/node/.bashrc

# Show current git branch in prompt when inside a git repository
if [ -f ~/.git-prompt.sh ]; then
    source ~/.git-prompt.sh
  export PS1='\[\e[32m\]\u@\h:\[\e[94m\]\w\[\e[33m\]$(__git_ps1 " (%s)")\[\e[0m\]\$ '
fi
EOF

RUN chown node:node /home/node/.bashrc
