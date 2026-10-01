#!/bin/bash
# Respaldo nocturno de Postgres a Cloudflare R2, con retencion de 7 dias (ver README.md de esta carpeta).
# Pensado para correr como un servicio de Railway con "Cron Schedule" - se despierta, hace su trabajo, termina.
set -euo pipefail

for var in DATABASE_URL R2_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET_NAME; do
    if [ -z "${!var:-}" ]; then
        echo "ERROR: falta la variable de entorno $var" >&2
        exit 1
    fi
done

FECHA=$(date -u +%Y-%m-%d_%H%M%S)
ARCHIVO="respaldo_${FECHA}.sql.gz"
RUTA_TMP="/tmp/${ARCHIVO}"

echo "Generando respaldo de la base de datos..."
pg_dump "$DATABASE_URL" | gzip > "$RUTA_TMP"
echo "Respaldo generado: $(du -h "$RUTA_TMP" | cut -f1)"

# rclone configurado via variables de entorno (sin archivo de config) - ver
# https://rclone.org/docs/#config-file y RCLONE_CONFIG_<remote>_<campo>.
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="$R2_ENDPOINT"

echo "Subiendo a R2 (carpeta backups/)..."
rclone copyto "$RUTA_TMP" "r2:${R2_BUCKET_NAME}/backups/${ARCHIVO}"
rm -f "$RUTA_TMP"

echo "Borrando respaldos de mas de 7 dias..."
rclone delete "r2:${R2_BUCKET_NAME}/backups/" --min-age 7d

echo "Respaldos actuales en R2:"
rclone ls "r2:${R2_BUCKET_NAME}/backups/"

echo "Listo: $ARCHIVO"
