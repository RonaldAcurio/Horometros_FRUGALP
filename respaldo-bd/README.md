# Respaldo automático de la base de datos

Servicio aparte, chiquito, que corre una vez por noche: respalda Postgres (`pg_dump`), sube el respaldo
comprimido a la misma cuenta de Cloudflare R2 que ya usa el backend para las fotos (carpeta `backups/`
dentro del mismo bucket), y borra automáticamente cualquier respaldo de más de 7 días. Nunca expone la base
de datos a internet — corre dentro de la red privada de Railway, igual que el backend.

**Activo y probado en producción** (2026-10-02): servicio `prolific-appreciation` dentro del proyecto de
Railway, corriendo contra el Postgres real y subiendo al bucket real de R2. Corrida de prueba confirmada con
"Completed" y `Listo: respaldo_2026-10-02_080130.sql.gz` en los logs, sin errores.

Dos bugs reales encontrados y corregidos en esa primera corrida (quedan documentados por si el día de mañana
hace falta tocar esto de nuevo):
- `pg_dump` abortaba con "aborting because of server version mismatch" - la imagen base traía Postgres 16,
  producción corre Postgres 18 (`pg_dump` se niega a respaldar un servidor más nuevo que él mismo). Arreglado
  en el `Dockerfile` (`postgres:18-alpine`) - si Railway sube de versión mayor en el futuro, esto hay que
  subirlo también.
- La subida a R2 fallaba con `403 AccessDenied` en una operación `CreateBucket` - rclone intenta verificar/crear
  el bucket destino por defecto, y la credencial de R2 (compartida con el backend, de propósito limitado) solo
  tiene permiso sobre objetos dentro del bucket que ya existe, no para crear buckets - correcto por seguridad.
  Arreglado con `RCLONE_S3_NO_CHECK_BUCKET=true` en `respaldo.sh`.

## Cómo activarlo en Railway (pasos manuales, una sola vez - ya hechos, dejados por si hace falta rearmarlo)

1. Dentro de tu proyecto de Railway (`gleaming-truth`, el real de Horómetros/FRUGALP) → botón **"+ New"** → **"Empty Service"**.
2. En la pantalla del nuevo servicio, pestaña **Settings** → sección **Source** → conecta el mismo
   repositorio de GitHub, pero en **"Root Directory"** pon `respaldo-bd` (así Railway usa el `Dockerfile` de
   esta carpeta, no el del backend).
3. Todavía en Settings, busca **"Cron Schedule"** → **"Customize"** y ponle `0 7 * * *` (corre todos los días
   a las 7:00 UTC = 2:00 AM hora de Ecuador — ajusta si prefieres otra hora). Deja "Custom Start Command"
   vacío - el `Dockerfile` ya trae su propio `CMD`.
4. En la pestaña **Variables** de este nuevo servicio, agrega (Railway sugiere los nombres solo al detectarlos
   en el código, pero ojo con los valores):
   - `DATABASE_URL` → `${{Postgres.DATABASE_URL}}` (Railway lo completa solo, es la conexión privada
     a tu Postgres real)
   - `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` → **no** uses el
     `${{ secret() }}` que Railway ofrece de entrada (eso genera una credencial nueva al azar, no sirve).
     Mejor referencia las del backend directamente: `${{Horometros_FRUGALP.R2_ACCESS_KEY_ID}}`, etc. - así
     quedan sincronizadas solas si algún día cambian.
5. Guarda. Railway va a hacer un primer deploy del contenedor (no corre el respaldo todavía, solo prepara
   la imagen) - el cron lo dispara solo a la hora que configuraste.
6. Para probarlo sin esperar a la noche: pestaña **"Cron Runs"** del servicio → botón **"Run now"**. Revisa
   el log de esa corrida (clic en la fila, no en "View logs" del deployment general) para confirmar que diga
   "Listo: respaldo_...sql.gz" al final, sin líneas de `ERROR`.

## Para restaurar un respaldo (si alguna vez hace falta)

1. Descarga el archivo `.sql.gz` más reciente desde R2 (panel de Cloudflare, o cualquier cliente S3 apuntando
   al bucket).
2. `gunzip respaldo_XXXX.sql.gz`
3. `psql "$DATABASE_URL" < respaldo_XXXX.sql`

(Avísame antes de restaurar algo en producción de verdad - es una operación que sobreescribe datos reales,
mejor hacerla acompañado.)
