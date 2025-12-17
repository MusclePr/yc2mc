FROM debian:bullseye-slim
ENV TZ=Asia/Tokyo

# 必要最小限のパッケージのみインストール
RUN apt-get update && apt-get -y install --no-install-recommends \
    apache2 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# www-data の UID/GID をホスト側に合わせる
ARG UID=1000
ARG GID=1000
RUN sed -i "s/www-data:x:33:33:/www-data:x:${UID}:${GID}:/" /etc/passwd \
    && sed -i "s/www-data:x:33:/www-data:x:${GID}:/" /etc/group

# ServerName 設定
RUN echo "ServerName localhost" > /etc/apache2/conf-available/fqdn.conf \
    && a2enconf fqdn

# 必要なモジュールのみ有効化
RUN a2enmod proxy proxy_http proxy_wstunnel rewrite headers

COPY src/httpd-foreground /usr/local/bin/
RUN chmod +x /usr/local/bin/httpd-foreground

EXPOSE 80
CMD ["httpd-foreground"]

