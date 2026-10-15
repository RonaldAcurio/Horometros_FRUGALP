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
  hacienda. `generarTokenHacienda`/`invalidarToken`/`deshacerCierreJornada`/`finalizarDia`
  escriben TAMBIÉN ahí, en doble escritura.
- **Token de Hacienda — Fase B** (el cambio de comportamiento real, YA HECHO): `login`,
  `marcarConCodigo`, `marcarConMiCodigo` y `obtenerHaciendas` dejan de leer
  `Hacienda.token_actual`/`token_expira_en` y pasan a consultar `tokens_hacienda`. Regla aplicada
  exactamente como se acordó: una **ENTRADA** nueva exige que el código sea el de **HOY**; una
  **SALIDA** nunca se fija en la fecha de la fila (sigue aceptando el mismo código con el que el
  trabajador entró, sin importar si cruzó medianoche). `generarTokenHacienda` ya acepta
  `{ dias: 1-3 }` para pre-generar varios días de una vez (el pedido real: el Supervisor deja
  listos sábado+domingo+lunes el viernes); cada día pre-generado recibe 48h de vigencia desde su
  propia medianoche Ecuador. `invalidarToken` ya acepta `{ fecha }` para invalidar un día
  específico entre los pre-generados sin tocar los demás (ni el campo viejo de Hacienda, que solo
  se toca cuando la fecha a invalidar es hoy). Verificado con 7 pruebas reales de punta a punta
  contra el backend local: generar 2 días crea 2 filas correctas; un código de mañana se
  RECHAZA hoy (401, mensaje claro); el de hoy se acepta; `obtenerHaciendas` muestra el token de
  hoy (no el de mañana); invalidar mañana no toca hoy ni el campo viejo; **una SALIDA con un
  token cuya fila es de AYER (todavía vigente) se acepta igual** — el escenario crítico de turno
  nocturno, confirmado sin romperse. Suite completa (27 unit + 10 integración) sigue en verde.
  **Nota de alcance**: el backend ya soporta generar varios días e invalidar uno específico; el
  Panel del Supervisor todavía solo tiene el botón de "generar token de hoy" — agregarle el
  control para elegir cuántos días (o cuál invalidar) es una tarea de frontend aparte, no incluida
  en esta pasada.

### Aparte — también probado, pendiente de tu propia prueba en celular
- **APK liviano**: el .apk se embebía a sí mismo dentro de sus propios assets (bug real de
  tamaño). Arreglado + R8/ProGuard: de ~100MB a **4.2MB**. Rama: `test/proguard-apk-size`.
  **Esperando que lo instales y confirmes antes de producción.**

### En planificación (sin código todavía)
- **Token de Hacienda — Fase C** (informe detallado, guardado para cuando lo pidas — solo cuando
  Fase B lleve tiempo estable en producción):
  - Quitar `haciendas.token_actual`/`token_expira_en` por completo (migración `removeColumn`,
    con `down()` que las re-crea vacías — mismo criterio que `cifrar-pii-operadores.js`: para ese
    punto el dato ya no es la fuente de verdad, no hay nada real que restaurar).
  - Quitar la doble escritura de Fase A en `generarTokenHacienda`/`invalidarToken`/
    `deshacerCierreJornada`/`finalizarDia` (ya no hace falta, nadie lee esos 2 campos).
  - Eliminar el parche viejo del bloque `esHoy` dentro de `finalizarDia` (`asistencia.controller.ts`)
    — ya no hace falta "matar" el token de hoy al cerrar el día: cada día ya tiene su propia fila
    en `tokens_hacienda`, el de mañana nunca dependió del de hoy.
  - Borrar también la función `tokenHaciendaVigente` y su archivo de pruebas
    (`utils/token-hacienda.ts`/`.test.ts`) — quedaron sin ningún llamado real desde Fase B, vivos
    solo como código muerto hasta este punto.
  - (Opcional, frontend) agregar al Panel del Supervisor un control para elegir cuántos días
    generar (1-3) y cuál invalidar — hoy esto solo es posible vía API, no tiene botón todavía.
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
