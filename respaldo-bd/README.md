# Respaldo automático de la base de datos

Servicio aparte, chiquito, que corre una vez por noche: respalda Postgres (`pg_dump`), sube el respaldo
comprimido a la misma cuenta de Cloudflare R2 que ya usa el backend para las fotos (carpeta `backups/`
dentro del mismo bucket), y borra automáticamente cualquier respaldo de más de 7 días. Nunca expone la base
de datos a internet — corre dentro de la red privada de Railway, igual que el backend.

Probado localmente (el `pg_dump` + compresión funciona bien); la subida a R2 no se pudo probar sin las
credenciales reales de producción.

## Cómo activarlo en Railway (pasos manuales, una sola vez)

1. Dentro de tu proyecto de Railway (`gleaming-truth`, el real de Horómetros/FRUGALP) → botón **"+ New"** → **"Empty Service"**.
2. En la pantalla del nuevo servicio, pestaña **Settings** → sección **Source** → conecta el mismo
   repositorio de GitHub, pero en **"Root Directory"** pon `respaldo-bd` (así Railway usa el `Dockerfile` de
   esta carpeta, no el del backend).
3. Todavía en Settings, busca **"Cron Schedule"** y ponle algo como `0 7 * * *` (corre todos los días a las
   7:00 UTC = 2:00 AM hora de Ecuador — ajusta si prefieres otra hora).
4. En la pestaña **Variables** de este nuevo servicio, agrega:
   - `DATABASE_URL` → valor `${{Postgres.DATABASE_URL}}` (Railway lo completa solo, es la conexión privada
     a tu Postgres real)
   - `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` → copia los mismos valores
     que ya tiene el servicio del backend (Variables → cópialos de ahí, son los mismos que usa para las fotos)
5. Guarda. Railway va a hacer un primer deploy del contenedor (no corre el respaldo todavía, solo prepara
   la imagen) - el cron lo dispara solo a la hora que configuraste.
6. Para probarlo sin esperar a la noche: en la pestaña del servicio, botón **"Deploy"** (o el menú de tres
   puntos → "Trigger Deploy") lo corre una vez ahora mismo. Revisa los logs ahí mismo para confirmar que
   diga "Listo: respaldo_...sql.gz" al final.

## Para restaurar un respaldo (si alguna vez hace falta)

1. Descarga el archivo `.sql.gz` más reciente desde R2 (panel de Cloudflare, o cualquier cliente S3 apuntando
   al bucket).
2. `gunzip respaldo_XXXX.sql.gz`
3. `psql "$DATABASE_URL" < respaldo_XXXX.sql`

(Avísame antes de restaurar algo en producción de verdad - es una operación que sobreescribe datos reales,
mejor hacerla acompañado.)
