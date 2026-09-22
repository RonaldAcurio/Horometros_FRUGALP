# FRUGALP - Sistema de Asistencia y Horómetros

Empresa agrícola. Backend Node/Express + TypeScript + Sequelize sobre PostgreSQL (Render, `dpg-dab9e9ojo6nc739j25ug-a`).
Frontend Angular 22 (standalone components) + Tailwind CSS, desplegado en **Vercel**. El destino final es empaquetar
la app **nativo** (no PWA) para los celulares de Mecánicos/Operadores, pero mientras se construye el Frontend se
prueba directo en el link de Vercel (navegador), no hace falta empaquetar para cada prueba.

Este documento es el briefing de arquitectura para retomar el proyecto en cualquier momento: qué existe, qué reglas
de negocio ya están confirmadas, y qué falta. No es un documento para el usuario final de la app.

## Los 2 módulos del sistema

1. **Asistencia** - el módulo activo, el que describe todo este documento.
2. **Horómetros** - OCR con Gemini para leer horómetros de fotos (`horometros.controller.ts`, `gemini.service.ts`).
   Módulo aparte, funcionando, **no tocar** salvo que se pida explícitamente.

## Roles

| Rol | Vive en | Alcance | Login |
|---|---|---|---|
| ADMIN | `usuarios` | Todo el sistema. Menú propio que además reproduce lo que hace SUPERVISOR y ASISTENTE. | JWT de sesión (8h) |
| ASISTENTE | `usuarios` | Auditoría/gestión de personal, Historial de Asistencia con filtro por fecha. **También** crea/lista Usuarios de oficina y resetea sus claves (decisión de negocio: lo va a manejar la Asistente de gerencia) - **no** administra Haciendas/Token, eso sigue siendo solo ADMIN/SUPERVISOR. | JWT de sesión (8h) |
| SUPERVISOR | `usuarios` | Una hacienda fija (`hacienda_id`). Valida marcaciones del día, confirma O/X, cierra jornada, escanea. | JWT de sesión (8h) |
| **ESCANER** | `usuarios` | Cuenta de un **punto de control físico** (tablet/celular fijo en la entrada de una hacienda). Una hacienda fija. Solo puede escanear/confirmar marcaciones - no ve reportes ni administra nada. | JWT de sesión (8h) |
| MECANICO / OPERADOR | `operadores` | Trabajador de taller/campo. `usuario`/`clave_hash` son columnas propias de `operadores` (no duplican identidad en `usuarios`, ver decisión abajo). | JWT de sesión, vigencia atada a su jornada (ver sección de sesión) |

**Por qué Operador no vive en `usuarios`:** ya existe una tabla que identifica a esa persona (código Megued, cédula,
carnet QR). Crear un segundo registro en `usuarios` para lo mismo duplicaría la identidad en 2 tablas y las
desincronizaría con el tiempo. En su lugar, `operadores` ganó columnas propias: `supervisor_id` (a qué
Supervisor/hacienda pertenece de forma permanente), `usuario`, `clave_hash`.

**Login único:** una sola pantalla en el frontend. `POST /api/auth/login` busca primero en `usuarios`, si no
encuentra busca en `operadores`. Un mismo `usuario` nunca puede existir en las dos tablas a la vez (se valida al
crear cada cuenta).

## ESCANER: por qué existe y cómo se ata a su hacienda

Antes solo el Supervisor podía escanear. En la práctica, algunos puntos de control físicos (portón/garita) necesitan
un dispositivo fijo dedicado a escanear/confirmar, sin que dependa de que el Supervisor tenga su celular ahí. ESCANER
es esa cuenta.

**Decisión de diseño (la pregunta que quedaba abierta se resolvió así):** la hacienda de una cuenta ESCANER (igual
que la de un SUPERVISOR) se fija **en el momento de creación**, por el Admin, nunca en el login. El login **NO deja
elegir** la hacienda de un menú - eso abriría la puerta a que alguien (por error o a propósito) mezcle trabajadores
de una hacienda con la marcación de otra. Lo único que el login hace es **mostrar** `hacienda_nombre` como
confirmación visual ("estás operando en Santa Clara"), de solo lectura. Detalle técnico: `usuarios.hacienda_id` ya
no tiene un UNIQUE de columna simple; son 2 índices UNIQUE **parciales** (`WHERE cargo = 'SUPERVISOR'` y
`WHERE cargo = 'ESCANER'`), así una misma hacienda tiene como máximo 1 Supervisor y 1 Escáner, pero ambos pueden
coexistir (migración `20260921060000`).

## Dos caminos de entrada a la jornada (Mecánico/Operador)

Cada hacienda opera en modo **código** (sin cámara) o modo **QR** (con cámara) - eso es una elección del Supervisor
en el frontend, no un campo en la BD (no hay forma de "trampear" el modo desde el backend: ambos endpoints existen
siempre, el frontend simplemente muestra uno u otro según cómo esté configurada esa hacienda).

### Camino A - Código + Token de Hacienda (`POST /api/asistencia/marcar-codigo`)

Para haciendas sin cámara. El propio trabajador teclea **su usuario + su clave** (prueba quién es) más el **Token de
Hacienda** vigente de ese punto de control (prueba que está físicamente ahí - lo genera el Supervisor/Admin,
vigencia 24h, `POST /api/haciendas/:id/token`). No emite JWT de sesión: es una acción de una sola vez, como escanear
el carnet, solo que autenticada por credenciales en vez de confiar ciegamente en un QR físico fotocopiable. Si el
trabajador marca en una hacienda que no es la suya, el sistema lo autoadmite bajo el Supervisor de esa hacienda
(reemplaza el paso manual de "admitir externo" para este camino, porque el Token ya probó la presencia física).

### Camino B - Login + QR de sesión (`GET /api/asistencia/mi-qr` + `POST /api/asistencia/marcar-qr-sesion`)

Para haciendas con cámara. El trabajador se loguea primero (con `POST /api/auth/login`, como cualquier cuenta), y ya
logueado pide su propio QR de jornada, que **alguien más** (Supervisor o Escáner) escanea. El QR **no** es su
`operador_id` fijo: es un JWT corto y aparte (`qr_token`, 90s de vigencia, tipo `qr_jornada`) que el frontend vuelve a
pedir y redibujar en bucle mientras el QR está en pantalla. Así una foto/captura de ese QR deja de servir en menos de
2 minutos - el reemplazo del viejo esquema "QR = operador_id" que sí se podía reusar indefinidamente.

### El carnet físico (kiosco) sigue existiendo

`POST /api/asistencia/marcar-qr` (sin autenticación) es el flujo clásico original: alguien escanea el carnet QR
impreso del trabajador. Sigue funcionando exactamente igual - es el que usan los puntos de marcación que todavía no
migraron a Camino A/B. Los 3 caminos comparten el mismo núcleo de lógica de entrada/salida
(`procesarMarcacion` en `asistencia.controller.ts`), para no triplicar reglas como el cruce de medianoche.

## Dos tokens que NO son lo mismo

| | JWT de sesión | Token de Hacienda | QR de jornada |
|---|---|---|---|
| Qué es | Firma stateless (`jwt.service.ts`) | Cadena aleatoria random | JWT corto, tipo `qr_jornada` |
| Dónde vive | No se guarda en la BD | `haciendas.token_actual` / `token_expira_en` | No se guarda en la BD |
| Vigencia | 8h (oficina) / atada a la jornada (Operador) | 24h | 90 segundos |
| Prueba qué | Quién sos (identidad) | Que estás físicamente en esa hacienda | Que esta persona sigue en jornada activa AHORA |

## Sesión del Operador atada a la jornada (no a una expiración fija)

Para ADMIN/ASISTENTE/SUPERVISOR/ESCANER el JWT dura 8h fijas, sin más reglas. Para Mecánico/Operador es distinto **a
propósito**: la sesión debe durar lo que dura su jornada, para que sus credenciales no puedan "cubrir" a un
compañero ausente con logins repetidos.

- **Al hacer login** (`auth.controller.ts`): si ya existe una `Asistencia` de hoy en estado `PENDIENTE_REVISION`,
  `FINALIZADO`, `SALIDA_OLVIDADA` u `OBSERVANDO`, el login se **rechaza** (403) - ya no hay nada que hacer hoy.
- **En cada request autenticado** (`verificarJornadaOperadorActiva` en `auth.middleware.ts`): revisa lo mismo por si
  el token fue emitido esta mañana (cuando la jornada seguía `EN_JORNADA`) y la jornada se cerró **mientras el token
  seguía vivo** - en ese caso lo corta igual, aunque el JWT todavía no haya expirado por tiempo.
- Aplica solo a rutas de cara al propio Operador (hoy: `GET /api/asistencia/mi-qr`). No aplica a rutas de oficina.

## O/X - Confirmación de asistencia del Supervisor

Al lado de cada trabajador que aparece logueado hoy en su panel, el Supervisor confirma si de verdad vino:
`PUT /api/asistencia/:id/confirmar` con `{ presente: boolean }`.

- **O (`presente:true`)**: solo marca `confirmado_por_supervisor = true`.
- **X (`presente:false`)**: además mueve `estado` a `OBSERVANDO` y **genera una observación automática** con fecha/hora
  ("Marcado como NO presente por el supervisor"). Esto es lo que atrapa el caso de que alguien pase su código/QR a un
  compañero que no llegó a trabajar - `OBSERVANDO` también corta su sesión (ver arriba) y lo saca del Historial oficial
  (que solo muestra `FINALIZADO`/`SALIDA_OLVIDADA`).
- No se puede confirmar un registro ya cerrado (`FINALIZADO`/`SALIDA_OLVIDADA`).

## Reglas de negocio confirmadas

1. Trabajador prestado entre haciendas: `admitirTrabajadorExterno` (acción manual del Supervisor receptor) sigue
   existiendo para el carnet físico; Camino A y Camino B lo automatizan solos porque el Token/QR ya prueban dónde
   está físicamente el trabajador.
2. Solo SUPERVISOR y ADMIN pueden admitir externos y confirmar O/X. SUPERVISOR y ESCANER pueden escanear
   (marcar-qr-sesion). Solo ADMIN/SUPERVISOR generan/invalidan el Token de Hacienda (Supervisor solo el de su
   propia hacienda) y crean haciendas nuevas (esto último solo ADMIN, un Supervisor no crea haciendas). ADMIN y
   ASISTENTE crean/listan Usuarios de oficina y resetean su clave.
3. `finalizarDia` (Supervisor) cierra la jornada de **su hacienda**, no de las demás - cada Supervisor cierra solo la
   suya. ⚠️ Pendiente: el endpoint todavía no filtra por hacienda en el código (ver Deuda técnica).
4. Reseteo de clave (Usuario u Operador): quien resetea fija una nueva, nunca puede "ver" la anterior (bcrypt no es
   reversible). No hay recuperación de clave por email/SMS en este alcance.
5. Un mismo `usuario` no puede existir a la vez en `usuarios` y en `operadores`.
6. Historial de Asistencia (Asistente/Admin) solo muestra jornadas ya cerradas (`FINALIZADO`/`SALIDA_OLVIDADA`),
   nunca `EN_JORNADA`/`PENDIENTE_REVISION`/`OBSERVANDO`.
7. Las fotos de evidencia (`foto_ingreso`, Base64) se excluyen de los listados (`hoy`/`historial`) y se piden aparte
   solo al hacer clic en "Ver Evidencia" (`GET /:id/foto`) - evita bajar cientos de KB por registro sin que nadie los
   pida.
8. Paginación en `hoy` y `historial` (server-side, `pagina`/`limite`).

## Tablas (estado real en producción)

- **haciendas**: `nombre`, `token_actual`, `token_expira_en`.
- **usuarios**: `nombre_completo`, `usuario`, `clave_hash`, `cargo` (ADMIN/ASISTENTE/SUPERVISOR/ESCANER), `activo`,
  `hacienda_id` (solo Supervisor/Escáner; UNIQUE parcial por cargo, no UNIQUE simple).
- **operadores**: datos personales + `rol` (MECANICO/OPERADOR) + `supervisor_id`, `usuario`, `clave_hash`
  (credenciales opcionales, van siempre juntas).
- **secciones**: ahora con `hacienda_id` obligatorio.
- **asistencias**: `estado` (`EN_JORNADA`/`PENDIENTE_REVISION`/`FINALIZADO`/`SALIDA_OLVIDADA`/`OBSERVANDO`),
  `hacienda_prestamo_id` + `admitido_por_usuario_id` (trabajador externo), `diesel_consumido`,
  `confirmado_por_supervisor` (O/X, null hasta que el Supervisor lo revisa).
- **registro_actividades**: el detalle del Panel de Actividades (equipo + actividad + sección + horómetro por
  jornada) - módulo ya construido (`registro_actividad.controller.ts`/`.rutes.ts`), no rediseñado en esta sesión.

## Frontend (estado real, revisado directo del repo)

Angular 22 standalone (sin NgModules), Tailwind CSS, `@zxing/ngx-scanner` (lectura de cámara) + `qrcode` (generación
de QR), HttpClient con interceptor de auth, testing con Vitest. Rutas por `loadComponent` (lazy), con guards.

**Ya construido:**
- `dashboard` - menú principal (Asistencia/Horómetros, + "Administración" si el rol es ADMIN o ASISTENTE).
- `asistencia-menu` - submenú del módulo Asistencia con las 3 tarjetas (Gestión de Personal / Punto de Marcación /
  Panel de Supervisor). Solo lo ve tal cual el ADMIN: `/asistencia` tiene el guard `asistenciaRedirectGuard`, que
  manda a cada otro rol directo a SU panel (SUPERVISOR → `/asistencia/supervisor`, ASISTENTE → `/asistencia/asistente`,
  ESCANER → `/asistencia/marcacion`) sin pasar por el menú - corrige un bug real donde un SUPERVISOR podía entrar al
  panel de la Asistente solo porque el menú no distinguía roles. Los 3 paneles además llevan `roleGuard` propio
  (`/asistencia/asistente` → ADMIN/ASISTENTE, `/asistencia/supervisor` → ADMIN/SUPERVISOR) para que esto no dependa
  solo de la navegación: aunque alguien escriba la URL directo, el guard de rol lo bloquea igual.
- `marcacion-kiosco` - el flujo clásico de escaneo de carnet físico (cámara al 40%, captura de evidencia). Sin guard
  a propósito: el trabajador lo usa SIN loguearse. El Supervisor también llega aquí desde un botón "📷 Escanear" en
  su propio panel (en vez de una tarjeta aparte en el menú); el botón "Menú" del header lo regresa a su panel porque
  `/asistencia` redirige según su rol.
- `supervisor-panel` - validación diaria, observaciones, Finalizar Día, botón "📷 Escanear" hacia el kiosco.
- `asistencia-panel` - Directorio de Operadores (+ credenciales usuario/clave/supervisor_id) e Historial de
  Asistencia con filtro de fecha (rol Asistente).
- `directorio-operadores` + `carnet-qr` - directorio y generación del carnet QR de cada Operador.
- `modal-actividad`, `visor-foto` - piezas compartidas (selector de actividades en la salida, ventana flotante de evidencia).
- `login` (`/login`) - pantalla única (usuarios + operadores), con `AuthService` (signals: `token`/`perfil`),
  `authGuard`/`guestGuard`/`roleGuard`, e interceptor que agrega el JWT a cada request y desloguea solo en un 401.
- `admin-panel` (`/admin`, ADMIN y ASISTENTE) - pestaña **Usuarios** (crear ADMIN/ASISTENTE/SUPERVISOR/ESCANER con
  clave, selector de hacienda solo si el cargo la necesita, resetear clave) y pestaña **Haciendas** (crear hacienda
  nueva, generar/invalidar su Token) - esta segunda pestaña **solo visible para ADMIN**, un Asistente no la ve.
- `NotificacionService`/`<app-toast>` y `ConfirmacionService`/`<app-confirm-modal>` (montados una vez en `app.html`) -
  reemplazan `alert()`/`confirm()` nativos del navegador en TODO el proyecto (no tienen sentido en una app
  empaquetada nativo). Todo campo de clave tiene su "ojito" para mostrar/ocultar.
- Módulo Horómetros (OCR) - aparte, no tocar (⚠️ el usuario quiere sacarlo a un proyecto separado, ver Pendiente).

**Detalle técnico importante para el que siga tocando componentes nuevos:** esta app necesita
`ChangeDetectorRef.detectChanges()` explícito después de cada respuesta HTTP que mute un campo plano (no-signal) del
componente - el zone.js de este proyecto no lo dispara solo. Es el patrón que ya usa TODO el código existente
(`cargarOperadores`, `guardarObservacion`, etc.); si un componente nuevo lo omite, la UI se actualiza mal en
silencio (se descubrió así un bug real: los modales de "Nuevo Usuario"/"Nuevo Operador" no se cerraban tras guardar).
Los `signal()` (usados para toggles de UI como mostrar/ocultar clave, o los estados de `NotificacionService`/
`ConfirmacionService`) sí se actualizan solos, sin necesitar este truco.

**Deuda técnica heredada (ya corregida donde se indica):**
- ~~`apuUrl`~~ → corregido a `apiUrl` en environments y en los servicios que lo usaban.
- `package.json` tiene una dependencia `qcore` instalada que no se usa en ningún lado del código (`grep` sin
  resultados) - candidata a eliminar, no se toca hasta confirmar que de verdad no se necesita.
- No hay `vercel.json` en el repo - el deploy en Vercel corre con auto-detección de Angular. Si Vercel necesita config
  especial (rewrites para rutas de Angular, variables de entorno de build), anotar aquí cuando se confirme.

## Cuenta ADMIN de arranque

Como `POST /api/usuarios` exige ya estar logueado como ADMIN, el primer Admin no se puede crear por la API (huevo y
gallina) - se insertó a mano por SQL directo en la base de producción de Render. Usuario `ronald_admin`, cargo
`ADMIN`, sin `hacienda_id`. Ya probado: login exitoso, devuelve JWT con `rol:"ADMIN"`.

## Endpoints

| Método/Ruta | Rol requerido | Qué hace |
|---|---|---|
| POST /api/auth/login | público | Login único (usuarios u operadores). Rechaza operador con jornada de hoy ya cerrada. |
| POST /api/usuarios | ADMIN, ASISTENTE | Crea Usuario de oficina (incluye ESCANER). |
| GET /api/usuarios | ADMIN, ASISTENTE | Lista usuarios (sin `clave_hash`). |
| PUT /api/usuarios/:id/clave | ADMIN, ASISTENTE | Resetea clave de un Usuario. |
| POST /api/asistencia/operadores | ADMIN, ASISTENTE | Crea Operador (+ credenciales opcionales). |
| PUT /api/asistencia/operadores/:id | ADMIN, ASISTENTE | Actualiza Operador (+ credenciales opcionales, no las borra si no vienen). |
| GET /api/asistencia/operadores | ADMIN, ASISTENTE | Lista operadores (sin `clave_hash`, ni el del supervisor incluido). |
| PUT /api/asistencia/operadores/:id/clave | ADMIN, ASISTENTE | Resetea clave de un Operador. |
| POST /api/asistencia/marcar-qr | público | Carnet físico clásico (entrada/salida) - sin JWT **a propósito**, lo usa el trabajador SIN loguearse en el kiosco. |
| POST /api/asistencia/marcar-codigo | público | Camino A: usuario+clave+Token de Hacienda - sin JWT **a propósito**, la credencial ES el operador. |
| GET /api/asistencia/mi-qr | operador, jornada activa | Camino B paso 1: genera el QR de 90s. |
| POST /api/asistencia/marcar-qr-sesion | SUPERVISOR, ESCANER | Camino B paso 2: valida el QR y marca. |
| PUT /api/asistencia/:id/confirmar | SUPERVISOR, ADMIN | O/X de asistencia. |
| GET /api/asistencia/hoy | ADMIN, SUPERVISOR | Reporte del día, paginado. |
| POST /api/asistencia/finalizar-dia | ADMIN, SUPERVISOR | Cierra jornada (⚠️ todavía no filtra por hacienda, ver Deuda técnica). |
| GET /api/asistencia/historial | ADMIN, ASISTENTE | Historial con filtros de fecha. |
| PUT /api/asistencia/revisar/:id | ADMIN, SUPERVISOR | Ajustes del Supervisor sobre un registro. |
| GET /api/asistencia/:id/foto | ADMIN, ASISTENTE, SUPERVISOR | Trae solo la foto de un registro (VisorFoto, compartido por ambos paneles). |
| POST /api/asistencia/admitir-externo | SUPERVISOR, ADMIN | Reclama a un trabajador prestado. |
| GET /api/actividad | público | Catálogo de actividades - sin JWT **a propósito**, lo usa el kiosco (modal-actividad) al marcar salida. |
| GET /api/actividad/:id | público | Idem, una sola actividad. |
| POST /api/actividad/nueva | ADMIN | Crea una actividad del catálogo (sin UI todavía, ver Pendiente). |
| PUT /api/actividad/:id | ADMIN | Edita una actividad del catálogo. |
| DELETE /api/actividad/:id | ADMIN | Elimina una actividad del catálogo. |
| POST /api/horometros/procesar-foto | cualquier cuenta logueada | Sube y procesa con IA una foto de reporte físico. |
| POST /api/horometros/confirmar-ingreso | cualquier cuenta logueada | Confirma la actualización a MEGUED. |
| POST /api/horometros/procesar-lote | cualquier cuenta logueada | Igual que arriba, hasta 6 fotos. |
| GET /api/haciendas | ADMIN, SUPERVISOR, ASISTENTE | Lista haciendas (id, nombre, token vigente). |
| POST /api/haciendas | ADMIN | Crea una hacienda nueva. |
| POST /api/haciendas/:id/token | ADMIN, SUPERVISOR (solo la suya) | Genera/regenera el Token de Hacienda. |
| DELETE /api/haciendas/:id/token | ADMIN, SUPERVISOR (solo la suya) | Invalida el Token antes de tiempo. |

**Auditoría de accesos (cerrada):** hasta esta ronda, `operadores`, `hoy`, `finalizar-dia`, `historial`, `revisar/:id`,
`:id/foto` (en `asistencia.rutes.ts`), las mutaciones de `actividad` y las 3 rutas de `horometros` no tenían
`verificarAutenticacion` ni `requireRol` - cualquiera que conociera la URL podía llamarlas sin loguearse. Quedó
documentado como deuda "temporal" desde antes del Login, pero el Login ya existe hace rato y nunca se cerró. Cada
ruta arriba quedó con el mismo rol que ya la protegía en el frontend (roleGuard/`*ngIf` de cada panel) - no se
inventó ningún permiso nuevo, solo se hizo cumplir en el backend lo que el frontend ya asumía. Se probó con curl
(401 sin token, 403 con rol equivocado, pasa con el rol correcto) y con Playwright contra los 3 paneles para
confirmar que ningún flujo real se rompió. `marcar-qr`, `marcar-codigo` y el catálogo de `actividad` (GET) siguen
públicos **a propósito**: los usa el kiosco sin login.

## Deuda técnica heredada

- `finalizarDia` no filtra por `hacienda_id`: un Supervisor con permiso para cerrar jornada cierra TODAS las
  haciendas del día a la vez, no solo la suya. Ya no está bloqueado por el Login (que ya existe) - queda pendiente
  como su propio cambio, ver Pendiente.
- `SequelizeMeta` de este checkout tenía un hueco (migraciones aplicadas a mano sin registrar) - ya reconciliado
  localmente, pero verificar en cualquier entorno nuevo con `sequelize-cli db:migrate:status`.

## Pendiente

**Backend**
- Filtrar `finalizarDia` por `hacienda_id` del Supervisor que ejecuta el cierre (ver Deuda técnica heredada) - es un
  hueco de alcance/autorización distinto al de `verificarAutenticacion`/`requireRol` (ya cerrado, ver Endpoints):
  ahí el Supervisor SÍ tiene permiso para la acción, solo que la acción no respeta el límite de "su" hacienda.

**Frontend** (sobre lo ya construido, ver sección de arriba)
- UI de Camino A (teclado numérico/código) y Camino B (QR flotante que se auto-refresca cada ~90s) - el Supervisor
  elige el modo de su hacienda.
- Botones O/X en el Panel de Supervisor, al lado de cada trabajador logueado hoy.
- Pantalla/rol ESCANER: login simplificado para dispositivo fijo de punto de control.
- Offline/sync: la app empaqueta nativo (no PWA, así que no aplica la limitación de Background Sync de iOS/Safari de
  todas formas), pero se mantiene el diseño de sync manual/periódico ya acordado para cuando no hay señal en campo.
- **Sacar el módulo Horómetros a un proyecto aparte** (decisión del usuario, todavía no ejecutada): separar lo que es
  exclusivo de Horómetros (componentes, servicio, modelo, la ruta `/horometros`) de lo compartido (`app.routes.ts`,
  `app.html`, el sistema de notificaciones) sin romper Asistencia.
- **Diseños de Figma confirmados, pendientes de construir** (el usuario los compartió, existen en su Figma):
  - En el Directorio de Operadores (Panel Asistente/Admin): por cada operador, acciones "Ver"/"Imprimir" para
    ver e imprimir la hoja física de actividades de ESE operador puntual, más "Descargar" (exporta a Excel, formato
    pendiente de que el usuario lo proporcione) e "Imprimir" general - este último solo se habilita cuando el
    Historial está filtrado a **un solo día** (imprime todas las hojas físicas de ese día de una vez); con varios
    días combinados no se habilita, para no tener que resolver "cuántas hojas de cuántos días imprimo".
  - Nueva pestaña para ver/agregar Equipos, Actividades y Secciones (catálogos que hoy no tienen UI de gestión).

## Flujo de trabajo de esta sesión

Backend: todo cambio se prueba primero contra Postgres local (`service postgresql start`, rol `postgre`/`1234`,
BD `horometros_db`) antes de darse por terminado. Migraciones nuevas van numeradas después de la última existente.

Frontend: mientras no esté empaquetado nativo, se prueba en el navegador contra el link de Vercel (o `ng serve` local
apuntando al backend real de Render) - no hace falta empaquetar para cada prueba.
