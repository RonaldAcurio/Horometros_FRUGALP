# FRUGALP - Sistema de Asistencia y Horómetros

Empresa agrícola. Backend Node/Express + TypeScript + Sequelize sobre PostgreSQL (Render). Frontend Angular,
empaquetado **nativo** (no PWA) para los celulares de Mecánicos/Operadores.

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
| ASISTENTE | `usuarios` | Auditoría/gestión de personal, Historial de Asistencia con filtro por fecha. | JWT de sesión (8h) |
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
   propia hacienda).
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

## Endpoints

| Método/Ruta | Rol requerido | Qué hace |
|---|---|---|
| POST /api/auth/login | público | Login único (usuarios u operadores). Rechaza operador con jornada de hoy ya cerrada. |
| POST /api/usuarios | ADMIN | Crea Usuario de oficina (incluye ESCANER). |
| GET /api/usuarios | ADMIN | Lista usuarios (sin `clave_hash`). |
| PUT /api/usuarios/:id/clave | ADMIN | Resetea clave de un Usuario. |
| POST /api/asistencia/operadores | público* | Crea Operador (+ credenciales opcionales). |
| PUT /api/asistencia/operadores/:id | público* | Actualiza Operador (+ credenciales opcionales, no las borra si no vienen). |
| GET /api/asistencia/operadores | público* | Lista operadores (sin `clave_hash`, ni el del supervisor incluido). |
| PUT /api/asistencia/operadores/:id/clave | ADMIN, ASISTENTE | Resetea clave de un Operador. |
| POST /api/asistencia/marcar-qr | público* | Carnet físico clásico (entrada/salida). |
| POST /api/asistencia/marcar-codigo | público* | Camino A: usuario+clave+Token de Hacienda. |
| GET /api/asistencia/mi-qr | operador, jornada activa | Camino B paso 1: genera el QR de 90s. |
| POST /api/asistencia/marcar-qr-sesion | SUPERVISOR, ESCANER | Camino B paso 2: valida el QR y marca. |
| PUT /api/asistencia/:id/confirmar | SUPERVISOR, ADMIN | O/X de asistencia. |
| GET /api/asistencia/hoy | público* | Reporte del día, paginado. |
| POST /api/asistencia/finalizar-dia | público* | Cierra jornada (⚠️ todavía no filtra por hacienda). |
| GET /api/asistencia/historial | público* | Historial con filtros de fecha. |
| PUT /api/asistencia/revisar/:id | público* | Ajustes del Supervisor sobre un registro. |
| GET /api/asistencia/:id/foto | público* | Trae solo la foto de un registro. |
| POST /api/asistencia/admitir-externo | SUPERVISOR, ADMIN | Reclama a un trabajador prestado. |
| POST /api/haciendas/:id/token | ADMIN, SUPERVISOR (solo la suya) | Genera/regenera el Token de Hacienda. |
| DELETE /api/haciendas/:id/token | ADMIN, SUPERVISOR (solo la suya) | Invalida el Token antes de tiempo. |

`*` público = todavía sin `verificarAutenticacion` en la ruta. Es así **a propósito, temporalmente**: el Frontend de
Login todavía no existe, y exigir JWT ahí rompería el kiosco/panel que ya está funcionando en producción. Se cierra
junto con el Frontend de Login (ver Pendiente).

## Deuda técnica heredada

- `finalizarDia` no filtra por `hacienda_id`: cierra TODAS las haciendas del día a la vez. Se corrige junto con el
  despliegue del Login (para no romper el botón "Finalizar Día" del Supervisor Panel que hoy no manda JWT).
- Varias rutas siguen sin `verificarAutenticacion` (ver tabla de Endpoints) - se cierran en el mismo paso que el
  Login llegue al Frontend.
- `SequelizeMeta` de este checkout tenía un hueco (migraciones aplicadas a mano sin registrar) - ya reconciliado
  localmente, pero verificar en cualquier entorno nuevo con `sequelize-cli db:migrate:status`.

## Pendiente

**Backend**
- Filtrar `finalizarDia` por `hacienda_id` (bloqueado por Login, ver arriba).
- Cerrar las rutas `público*` con `verificarAutenticacion` una vez exista el Login en el Frontend.

**Frontend** (nada de esto empezó)
- Pantalla de Login única (usuarios + operadores).
- Menú Admin (accede a lo que ve Supervisor y Asistente).
- UI de Camino A (teclado numérico/código) y Camino B (QR flotante que se auto-refresca cada ~90s) - el Supervisor
  elige el modo de su hacienda.
- Botones O/X en el Panel de Supervisor, al lado de cada trabajador logueado hoy.
- Pantalla/rol ESCANER: login simplificado para dispositivo fijo de punto de control.
- Generar/mostrar el Token de Hacienda vigente (Supervisor/Admin).
- Offline/sync: la app empaqueta nativo (no PWA, así que no aplica la limitación de Background Sync de iOS/Safari de
  todas formas), pero se mantiene el diseño de sync manual/periódico ya acordado para cuando no hay señal en campo.

## Flujo de trabajo de esta sesión

Todo cambio de backend se prueba primero contra Postgres local (`service postgresql start`, rol `postgre`/`1234`,
BD `horometros_db`) antes de darse por terminado. Migraciones nuevas van numeradas después de la última existente.
