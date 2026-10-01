FROM postgres:16-alpine

RUN apk add --no-cache bash curl unzip && \
    curl https://rclone.org/install.sh | bash && \
    rm -rf /var/cache/apk/*

COPY respaldo.sh /respaldo.sh
RUN chmod +x /respaldo.sh

CMD ["/respaldo.sh"]
