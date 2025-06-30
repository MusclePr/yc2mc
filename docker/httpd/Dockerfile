FROM debian:bullseye-slim
ENV TZ=Asia/Tokyo

RUN apt-get update
RUN apt-get -y install apache2 libapache2-mod-php less nano ssh certbot python3-certbot-dns-cloudflare anacron
RUN apt-get -y install php php-curl php-fileinfo php-gd php-mbstring php-exif php-mysql php-imagick php-zip php-intl php-dom

ARG UID=1000
ARG GID=1000
RUN groupadd -g ${GID} www
RUN useradd -u ${UID} -g ${GID} www
RUN \
        sed -ri \
                -e 's/^(\s*export\s+APACHE_RUN_USER=www)-data.*$/\1/' \
                -e 's/^(\s*export\s+APACHE_RUN_GROUP=www)-data.*$/\1/' \
                /etc/apache2/envvars

RUN echo "ServerName localhost" | tee /etc/apache2/conf-available/fqdn.conf
RUN a2enconf fqdn
RUN a2enmod ssl socache_shmcb proxy proxy_http proxy_wstunnel vhost_alias negotiation rewrite headers alias setenvif

COPY src/httpd-foreground /usr/local/bin/

EXPOSE 80
CMD ["httpd-foreground"]

