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

### Aparte — también probado, pendiente de tu propia prueba en celular
- **APK liviano**: el .apk se embebía a sí mismo dentro de sus propios assets (bug real de
  tamaño). Arreglado + R8/ProGuard: de ~100MB a **4.2MB**. Rama: `test/proguard-apk-size`.
  **Esperando que lo instales y confirmes antes de producción.**

### En planificación (sin código todavía)
- **Token de Hacienda, arreglo de fondo**: tabla `tokens_hacienda` (una fila por hacienda+fecha),
  3 fases de despliegue. Diseño ya refinado con la idea del Supervisor (generar hasta 3 días
  seguidos, ej. viernes genera sábado+domingo+lunes): **ENTRADA nueva exige `fecha = hoy`**
  (un código futuro no sirve hasta su día); **SALIDA no se filtra por fecha** (sigue funcionando
  con el código que ya sirvió al entrar, sin romper turnos que cruzan medianoche). Con esta regla
  se eliminan solos los 2 huecos detectados antes (ambigüedad de medianoche; dos tokens activos
  a la vez).
- **"Horas Trabajadas" del Historial** = suma de horas por actividad (`RegistroActividad`), no
  `hora_salida - hora_ingreso` como hoy. Cambia solo `obtenerHistorial`
  (`asistencia.controller.ts`). Depende de que la exigencia de cerrar labores ya esté en
  producción. Pendiente confirmar si el **kiosco físico** (único camino sin horas por actividad)
  sigue en uso real, para decidir qué mostrar ahí ("—" propuesto, con fallback ya definido).
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
