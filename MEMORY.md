# MEMORY.md — Horómetros FRUGALP

Respaldo de contexto del proyecto. Última actualización: 2026-10-14.

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

### Listo y probado en rama de pruebas — falta tu aprobación final para pasar a producción
- **Exigir cerrar todas las labores antes de marcar salida** (normal u "olvidada"), para
  OPERADOR y MECANICO. Bloqueo en el celular (antes de intentar la petición, evita el hueco del
  offline-first) + respaldo en el backend. Probado con suite completa (27+10 tests) y script
  end-to-end. Rama: `test/salida-exige-cerrar-labores`.
- **APK liviano**: se encontró que el .apk se embebía a sí mismo dentro de sus propios assets
  (bug real de tamaño, no solo falta de compresión). Arreglado + R8/ProGuard activado: de ~100MB
  a **4.2MB**. Rama: `test/proguard-apk-size`. **Esperando que lo instales en tu celular y
  confirmes que todo funciona antes de pasar a producción.**
- **Excel: "AUTORIZADO POR:" → "FIRMA SUPERVISOR"** (sin dos puntos, decidido). Cambio de una
  línea, aún no aplicado — iría junto con el punto de arriba.

### En planificación (modo plan, sin código todavía)
- **Token de Hacienda, arreglo de fondo**: hoy solo existe un parche puntual
  (`finalizarDia` no invalida el token si el día cerrado no es hoy) — la tabla `tokens_hacienda`
  de verdad (una fila por hacienda+fecha) nunca se construyó. Plan ya armado en 3 fases
  (aditiva → cambiar lecturas → limpieza), con 2 huecos ya identificados y resueltos en el
  diseño (no filtrar vigencia por fecha; invalidar cualquier token activo anterior al generar
  uno nuevo).
- **Token por Área**: idea nueva (cada área tiene su propio Supervisor). Se evaluaron 2 caminos;
  se recomienda que **cada Área pase a ser su propia Hacienda** (reusa 100% del sistema de
  Token/Supervisor ya probado, en vez de construir permisos nuevos por Sección). Pendiente que
  confirmes si algún reporte necesita juntar varias Haciendas de una misma finca física.
- **"Horas Trabajadas" del Historial** = suma de horas por actividad (`RegistroActividad`), no
  `hora_salida - hora_ingreso` como hoy. Cambia solo `obtenerHistorial`
  (`asistencia.controller.ts`). Pendiente confirmar si el **kiosco físico** (único camino sin
  horas por actividad) sigue en uso real, para decidir qué mostrar ahí ("—" propuesto).

### Candidatos menores, sin decisión aún
- Columna `operadores.area` (texto libre, viejo) confirmada sin uso real — limpieza opcional.
- 2 casos borde del offline aceptados tal cual (labor creada sin señal bloquea salida hasta
  sincronizar; ventana de milisegundos en la carga inicial del Panel de Actividades).
