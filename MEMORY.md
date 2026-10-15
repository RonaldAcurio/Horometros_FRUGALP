# MEMORY.md — Horómetros FRUGALP

Respaldo de contexto del proyecto. Última actualización: 2026-10-15.

## Qué es la aplicación

Sistema de asistencia y horómetros para trabajadores de campo (~950 Operadores/Mecánicos) de
FRUGALP, repartidos en varias Haciendas. Backend Node/Express/Sequelize/Postgres
(`backend-horometros/`), frontend Angular + Capacitor para Android (`frontend-horometros/`),
desplegado en Railway (backend) y Vercel (frontend web + descarga del .apk).

## Cómo funciona (resumen)

- **Roles de oficina**: ADMIN, ASISTENTE, SUPERVISOR, ESCANER (tabla `usuarios`, login con
  usuario+clave). **Trabajadores de campo**: OPERADOR y MECANICO (tabla `operadores`), cada uno
  fijo a un Supervisor, y ese Supervisor fijo a una Hacienda.
- **Marcar entrada/salida**: 4 caminos (kiosco QR físico, código de hacienda público, código
  autenticado desde la app, QR de sesión escaneado por Supervisor/Escáner) que convergen en
  `procesarMarcacion` (`asistencia.controller.ts`). Solo kiosco/código públicos usan un
  check-list simple sin horas; los otros 2 (los que de verdad usa casi todo el mundo desde el
  celular) pasan por el Panel de Actividades (`mi-jornada.ts`) con `RegistroActividad`
  (equipo, actividad, hora_inicio/hora_fin, horómetro).
- **Haciendas**: cada una tiene su propio Token (`token_actual`/`token_expira_en`, 24h), que el
  Supervisor genera a diario para que sus trabajadores marquen por código.
- **Secciones/Áreas**: tabla `secciones` (hija de Hacienda). Un OPERADOR tiene un `seccion_id`
  FIJO asignado al crear su cuenta (nunca un MECANICO — eso es exclusivo de OPERADOR). Se
  gestiona desde el Panel Admin, pestaña Haciendas.
- **Cierre de jornada**: el Supervisor revisa/confirma asistencias (`PENDIENTE_REVISION`) y puede
  cerrar el día en bloque (`finalizarDia`, fuerza `SALIDA_OLVIDADA` a quien quedó abierto).
- **Reportes**: hoja Excel de Taller por hacienda/día (`exportar-excel.service.ts`), Historial de
  Asistencias con filtros (Panel de Asistente/Admin).
- **Offline-first**: crear/cerrar labores y marcar salida funcionan sin señal (se encola en el
  celular con `@capacitor/preferences` y sincroniza solo al volver la conexión).

## PENDIENTE

### Listo, probado y con capturas — esperando tu confirmación para pasar a producción
Todo esto vive junto en la rama `test/salida-exige-cerrar-labores` (commits hasta el
2026-10-15), probado con 27 unit + 10 integración (sin regresiones) y capturas reales del flujo:
- **Exigir cerrar todas las labores antes de marcar salida** (normal u "olvidada"), OPERADOR y
  MECANICO. Bloqueo en el celular antes de intentar la petición (evita el hueco offline-first).
- **Refuerzo del borde offline**: mientras el Panel de Actividades todavía carga los registros,
  "Marcar salida"/"Marcar salida olvidada" quedan deshabilitados (cierra la ventana de
  milisegundos que antes podía dejar pasar una salida con labores realmente abiertas).
- **Excel: "AUTORIZADO POR:" → "FIRMA SUPERVISOR"** (sin dos puntos, aplicado y confirmado con
  un Excel de muestra generado).
- **Limpieza `operadores.area`**: columna muerta (sin uso real confirmado) eliminada con su
  migración (`20261015000000-quitar-area-de-operadores.js`). No confundir con
  `registro_actividades.area`, que SÍ se usa (OT del Mecánico) — esa no se tocó.
- **"Horas Trabajadas" del Historial** = suma de horas por actividad (`RegistroActividad.hora_fin
  - hora_inicio`), ya NO `hora_salida - hora_ingreso`. Labores sin cerrar se excluyen de la suma
  (no se les inventa un cierre); si una jornada no tiene NINGUNA actividad con horas (kiosco
  físico, el único camino que no pasa por el Panel de Actividades), queda en `null` y el frontend
  ya lo pinta como "—", nunca como "0 h" engañoso. Cambia solo `obtenerHistorial`
  (`asistencia.controller.ts`) — el frontend no necesitó ningún cambio, ya sabía mostrar `null`
  como "—".
- **Token de Hacienda — Fase A** (aditiva, cero riesgo): tabla `tokens_hacienda` nueva (una fila
  por hacienda+fecha) + modelo `TokenHacienda` + migración con backfill del token vigente de cada
  hacienda. `generarTokenHacienda`/`invalidarToken`/`deshacerCierreJornada`/`finalizarDia` ahora
  escriben TAMBIÉN ahí, en doble escritura — **nada cambia de lo que hoy se LEE** (login,
  marcar con código, el panel del Supervisor siguen usando exactamente
  `Hacienda.token_actual`/`token_expira_en`, intactos). Verificado con pruebas reales contra el
  backend local: generar crea 1 fila activa; regenerar el mismo día actualiza esa misma fila (no
  crea una nueva); invalidar la deja `activo=false`; el comportamiento viejo (`token_actual`) se
  comprobó sin cambios en los 3 casos. Suite completa (27+10) sigue en verde.

### Aparte — también probado, pendiente de tu propia prueba en celular
- **APK liviano**: el .apk se embebía a sí mismo dentro de sus propios assets (bug real de
  tamaño). Arreglado + R8/ProGuard: de ~100MB a **4.2MB**. Rama: `test/proguard-apk-size`.
  **Esperando que lo instales y confirmes antes de producción.**

### En planificación (sin código todavía)
- **Token de Hacienda — Fases B y C** (informe detallado, guardado para cuando lo pidas):
  - **Fase B (el cambio de comportamiento real)**: `tokenHaciendaVigente` deja de leer
    `Hacienda.token_actual`/`token_expira_en` y pasa a consultar `tokens_hacienda`, con la regla
    ya acordada con el usuario: **ENTRADA nueva exige `fecha = hoy`** (un código generado para
    mañana/pasado no sirve hasta que llegue su día — esto es lo que de verdad habilita "generar
    hasta 3 días seguidos", inútil en Fase A porque todavía nadie respeta la fecha al leer);
    **SALIDA NO se filtra por fecha** (sigue aceptando el mismo código con el que el trabajador
    entró, sin importar si ya cruzó medianoche — así no se reintroduce el bug de turnos
    nocturnos que ya se resolvió para jornadas). Call sites a cambiar: `auth.controller.ts`
    (login), `marcarConCodigo`/`marcarConMiCodigo` (`asistencia.controller.ts`).
    `obtenerHaciendas` pasa a hacer JOIN con la fila de HOY de cada hacienda para seguir
    devolviendo el mismo contrato JSON — **cero cambios de frontend** en esta fase.
    `generarTokenHacienda` gana un parámetro opcional "cuántos días" (1-3) para crear varias
    filas futuras de una vez. Riesgos a probar a fondo antes de desplegar: el turno nocturno
    cruzando medianoche (diseño ya resuelto, falta la prueba real); invalidar un código
    específico entre los pre-generados necesita una pantalla nueva (hoy solo existe "invalidar
    EL token", no "elige cuál de los 3").
  - **Fase C (limpieza, solo cuando Fase B lleve tiempo estable)**: quitar
    `haciendas.token_actual`/`token_expira_en` (migración con `down()` que las re-crea vacías,
    mismo criterio que `cifrar-pii-operadores.js` — para ese punto el dato ya no es la fuente de
    verdad). Quitar la doble escritura de Fase A. Eliminar el parche viejo de `finalizarDia`
    (`esHoy`) — ya no hace falta "matar" el token de hoy al cerrar el día: cada día ya tiene su
    propia fila, el de mañana nunca depende del de hoy.
- 2 casos borde offline — el principal (ventana de milisegundos) ya se reforzó arriba; queda
  el de una labor creada 100% sin señal, que no se puede cerrar hasta sincronizar (límite
  conocido, aceptado tal cual).

### PENDIENTE — Token por Área (informe detallado, guardado para cuando lo pidas)
Motivo real: cada Área dentro de una Hacienda tiene su propio Supervisor (no comparten uno).
Se evaluaron 2 caminos:
- **Camino A — tabla `tokens_seccion`**: descartado como primera opción. `Seccion` hoy NO tiene
  concepto de "su propio Supervisor" (solo `nombre`+`hacienda_id`) — habría que construir desde
  cero toda una capa de permisos por-área (quién genera/ve el token de esa área) duplicando la
  que ya existe y está probada para Hacienda. Alto riesgo de reintroducir bugs de alcance ya
  resueltos una vez (ej. "un Supervisor veía operadores de otro Supervisor").
- **Camino B — recomendado**: cada Área pasa a ser su propia Hacienda. Reusa el 100% del motor
  de Token/Supervisor/permisos ya construido y probado, cero tablas ni permisos nuevos.
  Contrapartida: la Sección que ya está en producción quedaría redundante para este caso (dos
  formas de resolver lo mismo), y cualquier pantalla/reporte que asuma "una Hacienda = una finca
  completa" (nombre del Excel, filtro del Historial, panel de Haciendas del Admin) pasaría a
  mostrar/filtrar por área en vez de por finca.
- **Bloqueante real**: falta confirmar si algún reporte necesita JUNTAR varias Haciendas (áreas)
  de una misma finca física en un solo total — el usuario dijo que lo iba a investigar por su
  cuenta antes de decidir. Sin código todavía, depende también de que el punto de Token de
  Hacienda (arriba) esté construido primero.
