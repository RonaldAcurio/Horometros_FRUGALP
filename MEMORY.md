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
  (equipo, actividad, hora_inicio/hora_fin, horómetro). Marcar salida exige cerrar antes todas
  las labores abiertas.
- **Token de Hacienda**: tabla `tokens_hacienda` (una fila por hacienda+fecha). Una ENTRADA nueva
  exige el código de HOY; una SALIDA no se fija en la fecha (no rompe turnos nocturnos). Soporta
  generar hasta 3 días de una vez e invalidar uno específico. El Supervisor Panel reutiliza su
  propio selector de fecha (el mismo que ya usaba para ver el Historial de otro día) para elegir
  PARA QUÉ DÍA generar/invalidar/consultar el token — no hace falta moverse día por día desde hoy.
- **Secciones/Áreas**: tabla `secciones` (hija de Hacienda). Un OPERADOR tiene un `seccion_id`
  FIJO asignado al crear su cuenta (nunca un MECANICO — eso es exclusivo de OPERADOR). Se
  gestiona desde el Panel Admin, pestaña Haciendas.
- **Cierre de jornada**: el Supervisor revisa/confirma asistencias (`PENDIENTE_REVISION`) y puede
  cerrar el día en bloque (`finalizarDia`, fuerza `SALIDA_OLVIDADA` a quien quedó abierto).
- **Reportes**: hoja Excel de Taller por hacienda/día (`exportar-excel.service.ts`, firma
  "FIRMA SUPERVISOR"), Historial de Asistencias con filtros (Panel de Asistente/Admin) — "Horas
  Trabajadas" es la suma real de las actividades, no el rango entrada→salida, mostrada en formato
  "Xh Ymin" (ej. "30min", "12h 1min"), no decimal.
- **Offline-first**: crear/cerrar labores y marcar salida funcionan sin señal (se encola en el
  celular con `@capacitor/preferences` y sincroniza solo al volver la conexión).
- **APK**: 4.2MB (antes ~100MB — se embebía a sí mismo dentro de sus propios assets, ya
  arreglado), con R8/ProGuard activado.

## Recién subido a producción (2026-10-15)
PR [#45](https://github.com/RonaldAcurio/Horometros_FRUGALP/pull/45): exigir cerrar labores antes
de salida, Excel "FIRMA SUPERVISOR", limpieza de `operadores.area`, Horas Trabajadas real, Token
de Hacienda Fases A+B completas. PR [#46](https://github.com/RonaldAcurio/Horometros_FRUGALP/pull/46):
APK liviano (R8 + quitar auto-incrustación). PR [#47](https://github.com/RonaldAcurio/Horometros_FRUGALP/pull/47):
calendario de tokens (el Supervisor elige para qué día generar/invalidar, usando su propio selector
de fecha ya existente) + Horas Trabajadas en formato "Xh Ymin" en vez de decimal. APK recompilado,
confirmado 4.2MB (4.422.786 bytes) en producción tras este merge.

## PENDIENTE

### 1 — Token de Hacienda — Fase C (limpieza final, informe detallado)
Solo cuando Fase B lleve tiempo estable en producción:
- Quitar `haciendas.token_actual`/`token_expira_en` por completo (migración `removeColumn`, con
  `down()` que las re-crea vacías — mismo criterio que `cifrar-pii-operadores.js`: para ese punto
  el dato ya no es la fuente de verdad, no hay nada real que restaurar).
- Quitar la doble escritura de Fase A en `generarTokenHacienda`/`invalidarToken`/
  `deshacerCierreJornada`/`finalizarDia` (ya no hace falta, nadie lee esos 2 campos).
- Eliminar el parche viejo del bloque `esHoy` dentro de `finalizarDia`
  (`asistencia.controller.ts`) — ya no hace falta "matar" el token de hoy al cerrar el día: cada
  día ya tiene su propia fila en `tokens_hacienda`.
- Borrar la función `tokenHaciendaVigente` y su archivo de pruebas (`utils/token-hacienda.ts`/
  `.test.ts`) — quedaron como código muerto desde Fase B.

### 2 — Token por Área (informe detallado)
Motivo real: cada Área dentro de una Hacienda tiene su propio Supervisor (no comparten uno). Se
evaluaron 2 caminos:
- **Camino A — tabla `tokens_seccion`**: descartado. `Seccion` hoy NO tiene concepto de "su
  propio Supervisor" — habría que construir desde cero toda una capa de permisos por-área,
  duplicando la que ya existe y está probada para Hacienda. Alto riesgo de reintroducir bugs de
  alcance ya resueltos una vez.
- **Camino B — recomendado**: cada Área pasa a ser su propia Hacienda. Reusa el 100% del motor
  de Token/Supervisor/permisos ya construido, cero tablas ni permisos nuevos. Contrapartida: la
  Sección que ya está en producción quedaría redundante para este caso, y cualquier pantalla/
  reporte que asuma "una Hacienda = una finca completa" (Excel, filtro del Historial, panel de
  Haciendas) pasaría a mostrar/filtrar por área.
- **Bloqueante real**: falta confirmar si algún reporte necesita JUNTAR varias Haciendas (áreas)
  de una misma finca en un solo total — el usuario lo va a investigar por su cuenta. Depende
  también de que la Fase C de Token de Hacienda esté resuelta primero.

### 3 — Casos borde menores, aceptados tal cual
- Una labor creada 100% sin señal no se puede cerrar hasta sincronizar (así bloquea la salida
  mientras tanto) — límite conocido del diseño offline, no es un bug.
