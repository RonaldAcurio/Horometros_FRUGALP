# pg_dump se niega a respaldar un servidor Postgres MAS NUEVO que el propio pg_dump (error real,
# 2026-10-02: produccion corre Postgres 18, esta imagen traia pg_dump 16 y abortaba con "aborting because of
# server version mismatch"). Usar la misma version mayor que el Postgres real de Railway, no la que se use en
# desarrollo local - si Railway actualiza de version mayor en el futuro, esto hay que subirlo tambien.
FROM postgres:18-alpine

RUN apk add --no-cache bash curl unzip && \
    curl https://rclone.org/install.sh | bash && \
    rm -rf /var/cache/apk/*

COPY respaldo.sh /respaldo.sh
RUN chmod +x /respaldo.sh

CMD ["/respaldo.sh"]
