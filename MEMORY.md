# MEMORY.md — Horómetros FRUGALP

Respaldo de contexto del proyecto. Última actualización: 2026-10-20 (PR #55).

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
  "Xh Ymin" (ej. "30min", "12h 1min"), no decimal. Un día marcado OBSERVANDO (la X del Supervisor,
  "no vino") queda visible en el Historial en pantalla (badge "❌ No presente", para auditoría) pero
  se excluye de "Exportar a Excel"/"Imprimir Hojas del rango"/"Ver/Imprimir" por fila — esos son el
  reporte oficial de horas, no deben mostrar a alguien que el Supervisor dijo que no trabajó. El
  reporte imprimible del Mecánico muestra la Actividad registrada, no el campo libre "OT". En el
  Excel la fecha se muestra DD/MM/YYYY y los trabajadores salen ordenados alfabéticamente A-Z por
  nombre (un solo `sort` en `generarYDescargar`, compartido por los dos flujos de exportación).
- **Eliminar/Activar Operador**: eliminar es soft-delete (`deletedAt`), pero su código/cédula/
  usuario seguían "ocupados" a nivel de UNIQUE de Postgres, bloqueando recrearlo. Si "Nuevo
  Operador" choca con uno de esos valores y pertenece a alguien eliminado, ofrece activarlo (mismo
  id, conserva su historial) en vez de solo bloquear. El usuario de un Operador ya activo también
  se puede editar por separado de la clave desde su Ficha (antes solo se podía resetear la clave).
- **Offline-first**: crear/cerrar/editar/eliminar labores y marcar salida funcionan sin señal (se
  encola en el celular con `@capacitor/preferences` y sincroniza solo al volver la conexión).
- **Editar/Eliminar Labor**: en el Panel de Actividades (`mi-jornada.ts`) el trabajador puede
  corregir equipo/actividad/observaciones de una labor ya registrada (nunca hora_inicio/hora_fin —
  el controller ni siquiera los lee) o eliminarla (borrado físico, SOLO permitido sobre la última
  labor de la jornada, para nunca abrir un hueco — el backend lo re-verifica siempre). La columna
  "Acción" son botones "chip" (icono + texto "Editar"/"Eliminar", borde propio, se rellenan de
  color al :hover/:active), sin badges de "Cerrada"/"En curso". Eliminar nunca toca el catálogo
  de Equipo/Actividad (la FK apunta desde la labor hacia el catálogo, no al revés).
- **APK**: 4.2MB (antes ~100MB — se embebía a sí mismo dentro de sus propios assets, ya
  arreglado), con R8/ProGuard activado.
- **Panel de Supervisor — agregar trabajadores/labores a mano**: botón "+ Agregar Usuario"
  (junto al título "Registro de Asistencia de Hoy") mete a la lista de hoy a un trabajador que no
  llegó a marcar, creando su Asistencia en `EN_JORNADA` igual que una entrada real — por eso
  Excel/Historial/O-X/"Cerrar Jornada" la tratan idéntico a cualquier otra fila, sin ningún caso
  especial. Botón ➕ a la izquierda de cada fila (solo visible en `EN_JORNADA`) abre el "Panel de
  labores" de ese trabajador — mismo diseño que el Panel de Actividades propio (`mi-jornada.ts`),
  para ver su historial de hoy y agregar una labor nueva, siempre después de la última.

## Recién subido a producción (2026-10-16)
PR [#45](https://github.com/RonaldAcurio/Horometros_FRUGALP/pull/45): exigir cerrar labores antes
de salida, Excel "FIRMA SUPERVISOR", limpieza de `operadores.area`, Horas Trabajadas real, Token
de Hacienda Fases A+B completas. PR [#46](https://github.com/RonaldAcurio/Horometros_FRUGALP/pull/46):
APK liviano (R8 + quitar auto-incrustación). PR [#47](https://github.com/RonaldAcurio/Horometros_FRUGALP/pull/47):
calendario de tokens (el Supervisor elige para qué día generar/invalidar, usando su propio selector
de fecha ya existente) + Horas Trabajadas en formato "Xh Ymin" en vez de decimal. PR
[#49](https://github.com/RonaldAcurio/Horometros_FRUGALP/pull/49): excluir OBSERVANDO (la X del
Supervisor) del Excel/impresión + badge en el Historial, activar operador eliminado (nuevo endpoint
`PUT /operadores/:id/activar`) con usuario/clave editables por separado, OT→Actividad en el reporte
del Mecánico. PR [#50](https://github.com/RonaldAcurio/Horometros_FRUGALP/pull/50): editar/eliminar
labor en el Panel de Actividades (hard delete solo en la última labor, editar nunca toca las horas,
offline-first para ambos, nuevas pruebas de integración). PR
[#51](https://github.com/RonaldAcurio/Horometros_FRUGALP/pull/51): botones Editar/Eliminar como
chips con borde (icono + texto) y :hover/:active de color, elegidos de entre 4 opciones comparadas
en un mockup antes de implementar. PR
[#52](https://github.com/RonaldAcurio/Horometros_FRUGALP/pull/52): fecha DD/MM/YYYY y orden
alfabético A-Z por nombre en el Excel exportado. APK recompilado, confirmado 4.2MB (4.425.342
bytes) en producción tras este merge. PR
[#53](https://github.com/RonaldAcurio/Horometros_FRUGALP/pull/53): ⚠️ **TEMPORAL** - botón "Forzar
eliminar" en `mi-jornada.ts`, acotado a un solo trabajador (GRANIZO SALAZAR JORGE EDUARDO), para
limpiar ~15-20 labores duplicadas por un bug de doble-toque. Solo en la web - el usuario pidió NO
esperar el rebuild del APK esta vez, porque esto se iba a revertir apenas terminara de limpiar la
cuenta. PR [#54](https://github.com/RonaldAcurio/Horometros_FRUGALP/pull/54): revertido - el botón
"Forzar eliminar" ya cumplió su propósito (cuenta limpia) y `mi-jornada.ts` volvió exactamente a
como estaba antes del PR #53 (`git revert -m 1` del merge commit `0a2ec5b`). El código no se perdió,
ver "Herramientas guardadas para reutilizar" abajo. PR
[#55](https://github.com/RonaldAcurio/Horometros_FRUGALP/pull/55): botón "+ Agregar Usuario" (mete
a un trabajador que no marcó a la lista de hoy, nuevo endpoint `POST /asistencia/agregar-manual`) y
botón ➕ por fila (Panel de labores de ese trabajador, reutiliza `crearRegistroActividad` sin
cambios). APK recompilado, confirmado ~4.23MB (4.430.778 bytes) en producción tras este merge.

## Herramientas guardadas para reutilizar

### "Forzar eliminar" (botón temporal de eliminación sin restricción de "última labor")
Guardado en la rama `herramienta-forzar-eliminar-labor` (GitHub, no se borra), apuntando al commit
`aac5a48` - tiene el feature completo: flag `forzar` en `eliminarRegistroActividad`
(`registro_actividad.controller.ts`), el parámetro `forzar` en `RegistroActividadService.eliminar()`
(frontend), el botón "⚠️ Forzar eliminar" en `mi-jornada.ts`/`.html` (acotado por
`nombre_completo` para no exponerlo a los ~950 trabajadores), y las 3 pruebas de integración que lo
cubren. Para traerlo de vuelta: crear una rama nueva desde `main` y hacer
`git cherry-pick aac5a48` (resolviendo conflictos si el código cambió desde entonces), ajustar el
nombre del trabajador acotado si hace falta, y subirlo igual que cualquier feature nuevo.

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

### 3 — Trabajador prestado cuenta para la hacienda receptora (implementado, SIN mergear a propósito)
Implementado y verificado en la rama `test/prestamo-hacienda2-fecha-excel` (no mergeada - el usuario pidió
dejarla pendiente el 2026-10-19 tras encontrar un vacío real al verificar el flujo completo, ver abajo):
- `obtenerAsistenciaHoy`/`obtenerHistorial` (solo filtrando por hacienda): un trabajador prestado a otra
  hacienda por el día aparece en los reportes de la hacienda RECEPTORA ese día, y deja de aparecer ese mismo
  día en los de su hacienda de ORIGEN (antes solo aparecía en la de origen, nunca en la receptora).
- `puedeVerHistorialDeOperador` (`registro_actividad.controller.ts`): ajustado para que el "Exportar a
  Excel" de la hacienda receptora no falle con 403 al pedir las labores del trabajador prestado - acotado
  SOLO al rango de fechas puntual del préstamo, nunca da acceso al historial completo.
- **Vacío real encontrado, sin resolver todavía**: `finalizarDia` ("Cerrar Jornada") sigue sin considerar
  `hacienda_prestamo_id` - solo la hacienda de ORIGEN puede cerrarle el día a un trabajador prestado, nunca
  la receptora, aunque esta última ahora lo vea en sus reportes. Si el trabajador se olvida de marcar salida,
  la hacienda receptora no tiene forma de cerrarle el día. El usuario pidió dejar esto pendiente de decisión
  antes de subir el cambio a producción.

### 4 — Casos borde menores, aceptados tal cual
- Una labor creada 100% sin señal no se puede cerrar hasta sincronizar (así bloquea la salida
  mientras tanto) — límite conocido del diseño offline, no es un bug.
