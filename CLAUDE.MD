# FRUGALP - Sistema de Asistencia

(El nombre del repo/BD sigue siendo "Horometros_FRUGALP"/`horometros_db` por historia - el módulo Horómetros que
le daba ese nombre se eliminó por completo, ver "Módulos del sistema".)

Empresa agrícola, ~950 trabajadores de campo (Mecánicos/Operadores) + ~150 de oficina. Backend Node/Express +
TypeScript + Sequelize sobre PostgreSQL, desplegado en **Railway** (backend + BD, red privada entre ambos).
Frontend Angular 22 (standalone components) + Tailwind CSS, desplegado en **Vercel**. Fotos de evidencia en
**Cloudflare R2**. Empaquetado Android nativo vía Capacitor (`.apk`, sin Play Store); iPhone se queda como
PWA-lite (Safari, "Agregar a pantalla de inicio") - ver "Infraestructura y despliegue" al final.

Este documento es el briefing de arquitectura para retomar el proyecto: qué existe, qué reglas de negocio están
confirmadas, y qué falta. No es un documento para el usuario final de la app (ver `README.md` para eso).

## Módulos del sistema

**Asistencia** es el único módulo activo. El módulo **Horómetros** (OCR con Gemini para leer horómetros de
fotos) se eliminó por completo a pedido del usuario - código y rutas borrados de raíz. Quedó sin tocar, a
propósito, por decisión explícita de no borrar columnas/tablas existentes: las columnas de `Equipo` exclusivas
de ese módulo (`ultimo_km_inicial`, `ultimo_real`, `numero_hoja`, `tiene_tope_10k`, `nombre_maquinaria`, todas
sin uso hoy) y la tabla `ingresos_semanales` completa (sin modelo Sequelize, la tabla sigue en Postgres). `Equipo`
es hoy un modelo 100% de Asistencia, CRUD completo en `equipo.controller.ts`.

## Roles

| Rol | Vive en | Alcance | Login |
|---|---|---|---|
| ADMIN | `usuarios` | Todo el sistema. | JWT de sesión (8h) |
| ASISTENTE | `usuarios` | Auditoría/gestión de personal, Historial con filtros. También crea/lista Usuarios de oficina y resetea claves. No administra Haciendas/Token. | JWT de sesión (8h) |
| SUPERVISOR | `usuarios` | Una hacienda fija (`hacienda_id`). Valida marcaciones del día, confirma O/X, cierra jornada, escanea. | JWT de sesión (8h) |
| ESCANER | `usuarios` | Cuenta de un punto de control físico (tablet/celular fijo). Una hacienda fija. Solo escanea/confirma - no ve reportes ni administra nada. | JWT de sesión (8h) |
| MECANICO / OPERADOR | `operadores` | Trabajador de taller/campo. `usuario`/`clave_hash` son columnas propias de `operadores` (no duplica identidad en `usuarios`). | JWT atado a la jornada (ver abajo) |

**Por qué Operador no vive en `usuarios`:** ya existe una tabla que identifica a esa persona (código Megued,
cédula, carnet QR) - un segundo registro en `usuarios` duplicaría la identidad y las desincronizaría con el
tiempo. `operadores` tiene columnas propias: `supervisor_id` (a qué Supervisor/hacienda pertenece de forma
permanente), `usuario`, `clave_hash`.

**Login único:** `POST /api/auth/login` busca primero en `usuarios`, si no encuentra busca en `operadores`. Un
mismo `usuario` nunca existe en las dos tablas a la vez (se valida al crear cada cuenta).

## ESCANER: cómo se ata a su hacienda

Cuenta de un dispositivo fijo de punto de control (portón/garita) para escanear/confirmar sin depender del
celular del Supervisor. Su hacienda (igual que la de un SUPERVISOR) se fija **en el momento de creación**, por
el Admin, nunca en el login - el login NO deja elegir hacienda de un menú, solo la muestra de forma informativa.
`usuarios.hacienda_id` no tiene UNIQUE simple: son 2 índices UNIQUE **parciales** (`WHERE cargo='SUPERVISOR'` y
`WHERE cargo='ESCANER'`, migración `20260921060000`) - máximo 1 Supervisor y 1 Escáner por hacienda, pero ambos
coexisten. `crearUsuario` devuelve 409 con mensaje claro si se viola. No hay relación directa Escáner↔Supervisor
en el modelo - se vinculan solo por `hacienda_id` compartido; cuando cualquiera de los dos escanea, el backend
usa el `hacienda_id` de quien está logueado para decidir préstamo (ver `marcarConQrSesion`).

## Dos caminos de entrada a la jornada (Mecánico/Operador)

Cuál camino le toca a un trabajador se deriva automáticamente de si su hacienda tiene ahora mismo un **Token de
Hacienda vigente** (`hacienda.token_actual` + `token_expira_en` en el futuro) - nunca una elección manual.
`POST /api/auth/login` lo calcula y manda `hacienda_requiere_codigo: boolean` en el perfil. Si el Supervisor
genera un Token hoy, sus trabajadores ven código; si lo deja vencer, ven QR.

### Camino A - Código (hacienda con Token vigente)

- `POST /api/asistencia/marcar-codigo` (público, sin JWT): kiosco clásico, usuario+clave+Token de Hacienda desde
  cero.
- `POST /api/asistencia/marcar-mi-codigo` (autenticado): pantalla **"mi jornada"** (fase `codigo`) - ya logueado,
  solo confirma el Token. La respuesta dice `tipo: 'ENTRADA' | 'SALIDA'`. ENTRADA lleva al Panel de Actividades
  (igual que QR). SALIDA termina la jornada (fase `terminado`, botón explícito "Cerrar sesión", nunca logout
  automático). Marcar salida por código **reenvía el mismo token que funcionó en la entrada** (`tokenHaciendaUsado`
  guardado en memoria) sin volver a pedirlo - solo si el backend lo rechaza (venció, cambió) se muestra el
  formulario para escribirlo de nuevo.
- Ambas comparten `procesarMarcacion` (núcleo único de entrada/salida para los 4 caminos, evita triplicar reglas
  como el cruce de medianoche).
- Trabajador marcando en una hacienda que no es la suya vía Token: se autoadmite bajo el Supervisor de esa
  hacienda (el Token ya prueba presencia física).
- **"¿Hoy trabajas en otra hacienda?"** (botón en la pantalla de código, solo `!asistenciaId`): en vez de pedir
  el token de una hacienda ajena (rechazado por seguridad, cualquiera con el token de otra hacienda se
  autoadmitiría sin verificación), muestra el QR normal del trabajador (mismo `generarMiQr`) para que lo escanee
  el Supervisor/Escáner de la hacienda destino - la prueba de presencia la sigue dando quien escanea, no el
  trabajador solo. `GET /api/asistencia/mi-estado` devuelve `es_prestamo: boolean` (de `hacienda_prestamo_id` de
  la jornada abierta) para que la SALIDA también muestre QR en vez de código, aunque su hacienda propia use Token.

### Camino B - Login + QR de sesión (hacienda SIN Token vigente)

`GET /api/asistencia/mi-qr` + `POST /api/asistencia/marcar-qr-sesion`. El QR **no** es el `operador_id` fijo: es
un JWT corto (`qr_token`, tipo `qr_jornada`, 90s de vigencia) que el frontend repide y redibuja en bucle - una
foto/captura deja de servir en minutos. Alguien más (Supervisor/Escáner, desde `/asistencia/escanear`) tiene que
escanearlo, obligatorio. `mi-jornada.ts` detecta el escaneo por **polling** de `GET /api/asistencia/mi-estado`
cada 5s y pasa sola a la fase `actividades`. La salida también requiere escaneo nuevo.

**Salida por QR NO vuelve a pedir actividades**: `marcarConQrSesion` deriva la lista directo de los
`RegistroActividad` ya cargados en el Panel de Actividades (`omitirActividadRequerida` en `ContextoMarcacion`) -
exclusivo del Camino B y del Camino A ya logueado (`marcarConMiCodigo`, mismo tratamiento); el kiosco físico y
el código público sin sesión siguen exigiendo elegir actividad al marcar salida.

**Autoservicio "Salida Olvidada"** (`POST /api/asistencia/marcar-salida-olvidada`, jornada activa requerida):
cuando el trabajador no puede volver a un punto de escaneo ni reingresar el código (sale tarde, ya se fue). Cierra
la jornada como `SALIDA_OLVIDADA` con la hora del clic (editable) y desloguea. El Supervisor la ve congelada,
igual que las que él cierra en bloque. También deriva actividades de `RegistroActividad` (mismo patrón que arriba
- si no lo hiciera, perdería las labores ya cargadas).

### El carnet físico (kiosco público)

`POST /api/asistencia/marcar-qr` (sin autenticación, `marcacion-kiosco.ts`, ruta `/asistencia/marcacion`) - flujo
clásico de escanear el carnet QR impreso sin loguearse. Comparte `procesarMarcacion` con los otros 3 caminos.

### Panel de Actividades (ambos caminos)

Con la jornada abierta, el trabajador registra labores contra **Equipos** (`GET /api/equipos`, solo lectura) y
**Actividades** (`GET /api/actividad`), vía `RegistroActividad`. El formulario cambia según el rol
(`esMecanico = perfil.rol !== 'OPERADOR'`):
- **MECANICO**: campo `area` (etiqueta "OT", Orden de Trabajo).
- **OPERADOR**: `horometro_inicio`/`horometro_final` (opcionales, sin validar que uno sea mayor que el otro).

Equipo/Actividad son autocompletar sobre **catálogos cacheados enteros en el celular** (`OfflineSyncService`,
signals `catalogoEquipos`/`catalogoActividades` persistidos en `@capacitor/preferences`, refrescados al detectar
conexión) - la búsqueda es instantánea con o sin señal, sin petición de red por letra escrita. Backend:
`obtenerEquipos`/`obtenerActividad` sin `pagina`/`limite` devuelven el catálogo completo; con esos parámetros,
paginado con `q` opcional (`ILIKE` sobre código/nombre).

`hora_inicio`/`hora_fin` de cada labor son **editables** (el trabajador puede cargar esto después de hacer la
labor) - opcionales, caen a la hora del servidor si no vienen. `hora_fin` debe ser posterior a `hora_inicio` de
esa misma labor. Una labor nueva tampoco puede empezar antes de la última ya registrada ese día
(`crearRegistroActividad` calcula el máximo de `hora_fin ?? hora_inicio` de la jornada). **Totalmente aparte** de
`hora_ingreso`/`hora_salida` de la `Asistencia` (la jornada completa).

**Inputs de hora**: dos `<input type="number">` (HH y MM) en vez de `<input type="time">` nativo - el widget
nativo tiene 3 "segmentos" internos y un clic en cualquier punto no siempre enfoca el de la hora, causando que se
edite el segmento equivocado sin que el usuario lo note. `horaComponentesAIso(hh, mm)` combina con la fecha de
hoy y manda ISO completo (con `Z`) - nunca el string crudo del input (un string sin offset se interpreta en la
zona horaria de quien lo parsea, no de quien lo escribió). Mensajes de "Entrada/Salida registrada a las..." usan
`{ timeZone: 'America/Guayaquil' }` explícito en `toLocaleTimeString` (sin esto, usa la zona del servidor).

## Dos tokens que NO son lo mismo

| | JWT de sesión | Token de Hacienda | QR de jornada |
|---|---|---|---|
| Qué es | Firma stateless (`jwt.service.ts`) | Cadena aleatoria | JWT corto, tipo `qr_jornada` |
| Dónde vive | No se guarda en BD | `haciendas.token_actual`/`token_expira_en` | No se guarda en BD |
| Vigencia | 8h (oficina) / atada a jornada (Operador) | 24h | 90 segundos |
| Prueba qué | Identidad | Presencia física en esa hacienda | Jornada activa AHORA |

## Sesión del Operador atada a la jornada

ADMIN/ASISTENTE/SUPERVISOR/ESCANER: JWT dura 8h fijas. Mecánico/Operador: la sesión dura lo que dura su jornada,
para que sus credenciales no puedan "cubrir" a un compañero ausente con logins repetidos.

- **Al login**: si ya existe una `Asistencia` de hoy en `PENDIENTE_REVISION`/`FINALIZADO`/`SALIDA_OLVIDADA`/
  `OBSERVANDO`, se rechaza (403).
- **En cada request** (`verificarJornadaOperadorActiva`): corta igual si la jornada se cerró mientras el token
  seguía vivo, aunque no haya expirado por tiempo. Aplica a `GET /mi-qr` y `POST /marcar-mi-codigo`. No aplica a
  `GET /mi-estado` (reporta el estado tal cual, incluido "ya se cerró") ni a rutas de oficina.

## O/X - Confirmación de asistencia del Supervisor

`PUT /api/asistencia/:id/confirmar` con `{ presente: boolean }`.
- **O**: marca `confirmado_por_supervisor = true`.
- **X**: mueve `estado` a `OBSERVANDO` + genera observación automática con fecha/hora. Atrapa el caso de que
  alguien pase su código/QR a un compañero ausente. `OBSERVANDO` corta la sesión y sale del Historial oficial
  (que solo muestra `FINALIZADO`/`SALIDA_OLVIDADA`/`OBSERVANDO`).
- Funciona aunque el registro ya esté cerrado (`FINALIZADO`/`SALIDA_OLVIDADA`) - una X sobre un registro cerrado
  lo **reabre** a `OBSERVANDO`, a propósito: el Token puede circular sin que el Supervisor lo note al momento.
- **Se congela por completo una vez que "Cerrar Jornada" cerró el día de esa hacienda** (`calcularDiaCerrado`,
  ver abajo) - si se detecta fraude después de cerrado, no hay forma de corregirlo desde este endpoint.

**"Cerrar Jornada" exige que TODOS estén confirmados primero.** `calcularDiaCerrado(fecha, supervisorId?)` es la
fuente única de verdad (acotada por hacienda cuando aplica): un día está cerrado cuando ningún registro de esa
fecha (y ese alcance) sigue `EN_JORNADA`/`PENDIENTE_REVISION` y ninguno tiene `confirmado_por_supervisor: null`.
3 consumidores: `diaCerrado` en `obtenerAsistenciaHoy` (controla el botón), `finalizarDia` (400 con
`{ message, faltan_confirmar: [...] }` si falta alguien), `revisarAsistencia` (Observación/hora_salida editable
mientras el día siga abierto, sin importar el estado de esa fila puntual).

## Reglas de negocio confirmadas

1. Trabajador prestado entre haciendas: `admitirTrabajadorExterno` (acción manual del Supervisor receptor) para
   el carnet físico; Camino A y B lo automatizan solos (Token/QR ya prueban dónde está el trabajador).
2. SUPERVISOR y ESCANER escanean (`marcar-qr-sesion`). Solo ADMIN/SUPERVISOR generan/invalidan el Token de
   Hacienda (Supervisor solo el suyo) y confirman O/X. Solo ADMIN crea haciendas. ADMIN y ASISTENTE crean/listan
   Usuarios de oficina y resetean claves.
3. `finalizarDia` cierra solo la hacienda del Supervisor que ejecuta (o la que ADMIN elija vía `supervisor_id`
   opcional) - nunca todas a la vez para un Supervisor real.
4. Reseteo de clave: quien resetea fija una nueva, nunca ve la anterior (bcrypt no es reversible). Sin
   recuperación por email/SMS.
5. Un mismo `usuario` no existe a la vez en `usuarios` y `operadores`.
6. Historial de Asistencia solo muestra jornadas ya cerradas Y confirmadas (`confirmado_por_supervisor != null`)
   - una `SALIDA_OLVIDADA` autoservicio (que no pasa por `finalizarDia`) no debe aparecer sin que el Supervisor
   ya haya revisado O/X.
7. Fotos de evidencia se excluyen de los listados (`hoy`/`historial`), se piden aparte solo al hacer clic en "Ver
   Evidencia" (`GET /:id/foto`) - evita bajar cientos de KB por registro sin que nadie los pida.
8. Paginación server-side en `hoy` y `historial` (`pagina`/`limite`).
9. **Alcance por Supervisor**: un SUPERVISOR real solo ve/edita lo de su propia hacienda (nunca elige otra vía
   parámetro) - aplica a `obtenerAsistenciaHoy`, `revisarAsistencia`, `confirmarAsistencia`, `obtenerFotoAsistencia`,
   `finalizarDia`, `calcularDiaCerrado`, y a `registro_actividad.controller.ts` completo
   (`puedeOperarSobreAsistencia` para operar sobre una jornada puntual, `puedeVerHistorialDeOperador` para el
   historial completo - este último NO cuenta trabajadores prestados, prestar un día no da acceso al historial
   laboral completo en otras haciendas). `obtenerHaciendas` no expone `token_actual`/`token_expira_en` de otras
   haciendas a un SUPERVISOR. ADMIN/ASISTENTE nunca quedan restringidos. Un Supervisor SÍ tiene permiso sobre un
   trabajador prestado que él mismo admitió hoy (`hacienda_prestamo_id`).
10. **Jornada ambigua al reingresar** (`procesarMarcacion`, `diferenciaEnDiasCalendario`): al encontrar una
    jornada `EN_JORNADA` sin cerrar, compara la fecha de esa jornada contra hoy en DÍAS CALENDARIO, no en horas -
    0 días: sigue como salida normal (turno nocturno cruzando medianoche). 2+ días: se cierra sola como
    `SALIDA_OLVIDADA`, el escaneo actual es una entrada nueva. Exactamente 1 día: caso ambiguo real (turno
    nocturno en curso vs. entrada olvidada de ayer) - el código autenticado (única pantalla con UI para
    preguntar) responde 409 `jornada_ambigua:true` y el trabajador elige `'cerrar' | 'iniciar_nuevo'`
    (`accion_jornada_anterior`); los caminos sin pantalla propia (kiosco, código público, QR escaneado por
    otro) se auto-resuelven como `'iniciar_nuevo'` (`permiteAutoDecidirJornadaAnterior`). La ambigüedad solo
    puede aparecer después de que el trabajador toque "Marcar salida" explícitamente - un refresh con jornada
    abierta siempre va directo al Panel de Actividades, nunca al formulario en blanco.
11. **"Cerrar Jornada" cierra TODAS las puertas de esa hacienda para ese día, no solo el Token**: Token de
    Hacienda (Camino A) y QR de sesión (Camino B) son las dos únicas puertas de entrada al Panel de Actividades
    - una vez que el Supervisor (o el ADMIN) ejecuta `finalizarDia` sobre una hacienda, ninguna de las dos debe
    volver a dejar entrar para esa fecha, "porque ya se cerró ese día" (pedido explícito del usuario,
    2026-10-02). `finalizarDia` invalida `token_actual`/`token_expira_en` de la(s) hacienda(s) que de verdad
    cerró (mismo alcance que el cierre mismo - ver regla 3), lo que ya bloquea el Camino A. Para el Camino B y
    el carnet físico (que nunca dependieron del Token), `procesarMarcacion` agrega un chequeo explícito antes de
    crear una entrada nueva: `calcularDiaCerradoHacienda(hoy, haciendaDestino)` - una versión de
    `calcularDiaCerrado` (regla 9) que SÍ es consciente de `hacienda_prestamo_id`, al revés que esa (necesaria
    porque esa otra está acotada a propósito por el supervisor-hogar de cada trabajador, no por la hacienda
    física donde ocurrió la marcación - un préstamo nuevo después de cerrar "reabría" el cálculo de la hacienda
    de casa por error si se reusaba tal cual). El chequeo es siempre sobre la hacienda de DESTINO (la propia del
    operador, o la prestada vía `hacienda_prestamo_id` si está entrando a marcar en otra hacienda distinta a la
    suya) - nunca sobre la hacienda de "casa" del operador cuando es un préstamo, para que: (a) un trabajador
    prestado a una hacienda ya cerrada quede bloqueado aunque su propia hacienda siga abierta, (b) uno que
    presta su hacienda (ya cerrada) a otra que sigue abierta SÍ pueda entrar ahí. Usa siempre la fecha de HOY
    (nunca una pasada), así que el día siguiente arranca en 0 registros para esa hacienda y deja entrar normal
    solo, y cerrar días atrasados uno por uno (backlog) nunca toca la fecha de hoy - no interfiere con ninguno
    de los dos.

## Tablas (estado real en producción)

- **haciendas**: `nombre`, `token_actual`, `token_expira_en`.
- **usuarios**: `nombre_completo`, `usuario`, `clave_hash`, `cargo` (ADMIN/ASISTENTE/SUPERVISOR/ESCANER),
  `activo`, `hacienda_id` (solo Supervisor/Escáner; UNIQUE parcial por cargo), `terminos_aceptados_en`,
  `sesion_valida_desde`.
- **operadores**: datos personales (`cedula`/`telefono`/`direccion` cifrados, ver abajo) + `rol`
  (MECANICO/OPERADOR) + `supervisor_id`, `usuario`, `clave_hash`, `terminos_aceptados_en`, `sesion_valida_desde`.
  Soft-delete (`paranoid`).
- **equipos** / **actividades**: catálogos, soft-delete (`paranoid`). `equipos.numero_hoja` admite NULL (era
  `NOT NULL`, exclusivo de Horómetros).
- **secciones**: `hacienda_id` obligatorio. Sin CRUD/UI todavía (fase 2, siempre NULL en `registro_actividad`).
- **asistencias**: `estado` (`EN_JORNADA`/`PENDIENTE_REVISION`/`FINALIZADO`/`SALIDA_OLVIDADA`/`OBSERVANDO`),
  `hacienda_prestamo_id` + `admitido_por_usuario_id` (trabajador externo), `confirmado_por_supervisor` (O/X, null
  hasta revisión), `foto_ingreso` (base64, legado) + `foto_r2_key` (key en Cloudflare R2, ver "Fotos en R2").
- **registro_actividades**: detalle del Panel de Actividades (equipo + actividad + sección + horómetro por
  jornada).
- **registros_auditoria** / **registros_dispositivo**: append-only, ver "Auditoría y observabilidad".

## Frontend

Angular 22 standalone (sin NgModules), Tailwind CSS, `@zxing/ngx-scanner` (cámara) + `qrcode` (generación),
HttpClient con interceptor de auth (agrega JWT, desloguea solo en 401), Vitest.

### Ruteo por rol: cada rol tiene su propia "casa"

`rutas-por-rol.ts` centraliza a dónde pertenece cada rol (`rutaHomePorRol`) - la usan login, `roleGuard` (nunca
manda a un `/dashboard` fijo, causaría loop para roles sin Dashboard), `homeRedirectGuard`, y el botón "Menú".

| Rol | Ruta hogar | Qué ve |
|---|---|---|
| ADMIN, ASISTENTE, SUPERVISOR | `/dashboard` | Menú (Asistencia, + Administración si aplica) |
| ESCANER | `/escaner` | Un solo botón "📷 Escanear" |
| MECANICO, OPERADOR | `/mi-jornada` | Código o QR según su hacienda, luego Panel de Actividades |

**Páginas:**
- `dashboard` - menú principal, solo ADMIN/ASISTENTE/SUPERVISOR.
- `asistencia-menu` (`/asistencia`, guard `asistenciaRedirectGuard`) - manda cada rol directo a su panel sin
  pasar por el menú compartido (SUPERVISOR→`/asistencia/supervisor`, ASISTENTE→`/asistencia/asistente`).
- `escaner-menu` (`/escaner`, rol ESCANER) - un solo botón a propósito, lleva a `/asistencia/escanear`.
- `escaneo-sesion` (`/asistencia/escanear`, ADMIN/SUPERVISOR/ESCANER) - escaneo autenticado del QR de sesión
  (Camino B), distinto del kiosco público (`marcacion-kiosco`, `/asistencia/marcacion`, público, sin guard).
- `supervisor-panel` (`/asistencia/supervisor`) - validación diaria, O/X, Finalizar Día, botón Escanear.
- `asistencia-panel` (`/asistencia/asistente`) - Directorio de Operadores, Historial, pestañas Equipo/Actividad/
  Términos (ver abajo).
- `mi-jornada` (`/mi-jornada`, MECANICO/OPERADOR, pantalla cautiva sin botón Menú) - 3 fases: `codigo`, `qr`,
  `actividades` (ver "Dos caminos" arriba). Al entrar, consulta `mi-estado` antes de decidir la fase - jornada
  abierta siempre va directo a Actividades.
- `admin-panel` (`/admin`, ADMIN y ASISTENTE) - pestañas Usuarios (crear ADMIN/ASISTENTE/SUPERVISOR/ESCANER) y
  Haciendas (crear/generar-invalidar Token, solo visible a ADMIN) e Historial de auditoría (solo ADMIN).
- `modal-actividad`, `visor-foto` - piezas compartidas entre `marcacion-kiosco`, `escaneo-sesion`, `mi-jornada`.
- `login` (`/login`) - única pantalla (usuarios + operadores). Botón "⬇️ Descargar app para Android"
  (`*ngIf="esNavegador"`, oculto dentro de la app empaquetada) apunta a `/frugalp.apk`
  (`public/frugalp.apk` - reemplazar ese archivo y hacer push en cada release nueva).
- `NotificacionService`/`<app-toast>` y `ConfirmacionService`/`<app-confirm-modal>` - reemplazan `alert()`/
  `confirm()` nativos en todo el proyecto.
- `TerminosModal` (`shared/terminos-modal/`, montado en `app.html` fuera del router-outlet) - modo bloqueante
  (`terminos_aceptados === false`, sin botón Cerrar hasta aceptar) y modo libre (botón del header/login, solo
  releer). `POST /api/auth/aceptar-terminos` pone `terminos_aceptados_en = NOW()`.
- Pestaña **"✅ Términos"** (Panel de Asistente, junto a Actividad) - quién aceptó/falta aceptar, separado en
  Trabajadores (paginado) y Usuarios de oficina.

**Detalle técnico importante:** esta app necesita `ChangeDetectorRef.detectChanges()` explícito después de cada
respuesta HTTP que mute un campo plano (no-signal) - el zone.js del proyecto no lo dispara solo. Los `signal()`
(toggles de UI) sí se actualizan solos.

**Al agregar una columna UNIQUE nueva:** chequear el duplicado ANTES del INSERT/UPDATE y devolver 409 con mensaje
claro (campo, valor, quién ya lo tiene) - un `SequelizeUniqueConstraintError` que se escapa da un error crudo de
Postgres (fuga de SQL/parámetros al cliente, no solo mal UX). **Ojo con `paranoid` + UNIQUE**: una fila
soft-deleted no aparece en `findAll()` normal pero el `UNIQUE` de Postgres la sigue viendo ocupada - cualquier
chequeo de duplicado contra un modelo `paranoid` necesita `paranoid:false` explícito para ver el universo real de
la restricción (bug real encontrado en `importarEquipos`/`importarActividades`, con el agravante de que
`bulkCreate` es un solo INSERT: si una fila choca, ninguna del lote se crea).

**Capacitor - APIs que no se comportan igual en el WebView:** `window.open`/`window.print()` no funcionan en el
WebView de Capacitor (no hay multi-ventana ni diálogo de impresión nativo) - usar `@capacitor/share` +
`@capacitor/filesystem` para compartir en nativo, rama aparte con `Capacitor.isNativePlatform()`, dejando
`window.print()` intacto para escritorio. El botón/gesto "Atrás" de Android cierra la app en vez de navegar si no
se maneja: `@capacitor/app`, listener de `backButton` que navega si hay historial o deja salir si no lo hay -
bloqueado del todo para MECANICO/OPERADOR (pantalla cautiva, no debe poder volver al login a mitad de jornada).
`@capacitor/clipboard` en vez de `navigator.clipboard` (comportamiento inconsistente en WebView).

## Endpoints

| Método/Ruta | Rol requerido | Qué hace |
|---|---|---|
| POST /api/auth/login | público | Login único. Rechaza operador con jornada de hoy ya cerrada. |
| POST /api/usuarios | ADMIN, ASISTENTE | Crea Usuario de oficina (incluye ESCANER). |
| GET /api/usuarios | ADMIN, ASISTENTE | Lista usuarios. |
| PUT /api/usuarios/:id/clave | ADMIN, ASISTENTE | Resetea clave de un Usuario. |
| POST /api/asistencia/operadores | ADMIN, ASISTENTE | Crea Operador. |
| PUT/GET /api/asistencia/operadores(/:id) | ADMIN, ASISTENTE | Actualiza/lista Operadores. |
| PUT /api/asistencia/operadores/:id/clave | ADMIN, ASISTENTE | Resetea clave de un Operador. |
| POST /api/asistencia/marcar-qr | público | Carnet físico, sin JWT a propósito. |
| POST /api/asistencia/marcar-codigo | público | Camino A: usuario+clave+Token de Hacienda. |
| GET /api/asistencia/mi-qr | operador, jornada activa | Camino B paso 1: QR de 90s. |
| GET /api/asistencia/mi-estado | operador | Consulta si ya tiene jornada hoy (usado por polling). |
| POST /api/asistencia/marcar-mi-codigo | operador, jornada activa | Camino A ya logueado. |
| POST /api/asistencia/marcar-salida-olvidada | operador, jornada activa | Autoservicio SALIDA_OLVIDADA. |
| POST /api/asistencia/marcar-qr-sesion | ADMIN, SUPERVISOR, ESCANER | Camino B paso 2: escanea y marca. |
| PUT /api/asistencia/:id/confirmar | SUPERVISOR, ADMIN | O/X. |
| GET /api/asistencia/hoy | ADMIN, SUPERVISOR | Reporte del día, paginado, acotado por hacienda. |
| POST /api/asistencia/finalizar-dia | ADMIN, SUPERVISOR | Cierra jornada, acotado por hacienda. |
| GET /api/asistencia/historial | ADMIN, ASISTENTE | Historial con filtros (fecha, hacienda, supervisor). |
| PUT /api/asistencia/revisar/:id | ADMIN, SUPERVISOR | Ajustes del Supervisor sobre un registro. |
| GET /api/asistencia/:id/foto | ADMIN, ASISTENTE, SUPERVISOR | Foto de evidencia (VisorFoto). |
| POST /api/asistencia/admitir-externo | SUPERVISOR, ADMIN | Reclama un trabajador prestado. |
| GET /api/actividad(/:id) | público | Catálogo de actividades. Sin pagina/limite: completo; con: paginado+`q`. |
| POST/PUT/DELETE /api/actividad | ADMIN, ASISTENTE | CRUD del catálogo (soft-delete). |
| GET /api/equipos | cualquier cuenta logueada | Catálogo de Equipos, mismo patrón paginado/completo que Actividad. |
| POST/PUT/DELETE /api/equipos | ADMIN, ASISTENTE | CRUD del catálogo (soft-delete). |
| POST /api/*/importar | ADMIN, ASISTENTE | Importa Equipo/Actividad desde Excel (parseado en el navegador, backend recibe JSON). |
| GET /api/haciendas | ADMIN, SUPERVISOR, ASISTENTE | Lista haciendas (Supervisor ve el token solo de la suya). |
| POST /api/haciendas | ADMIN | Crea hacienda. |
| POST/DELETE /api/haciendas/:id/token | ADMIN, SUPERVISOR (solo la suya) | Genera/invalida el Token. |
| GET /api/registro-actividades | autenticado | Labores de una jornada, acotado por alcance de Supervisor. |
| POST /api/registro-actividades | autenticado | Crea una labor. |
| PUT /api/registro-actividades/:id/finalizar | autenticado | Cierra una labor. |
| GET /api/registro-actividades/por-operador | autenticado | Historial de labores de un operador (reporte imprimible). |
| GET /api/auditoria | ADMIN | Historial de auditoría técnica, paginado. |
| POST /api/auth/registrar-dispositivo | autenticado | Registra SO/versión del dispositivo (solo app nativa). |
| POST /api/auth/aceptar-terminos | autenticado | Acepta Política de Privacidad/Términos. |

Todas las rutas de negocio requieren `verificarAutenticacion`/`requireRol` explícito, salvo las marcadas
"público" a propósito (el kiosco/código público las usa sin login).

## Seguridad, auditoría y calidad (estado actual)

**Seguridad de la app:** sesiones ✅ (revocación real al cambiar clave, ver abajo) · claves con bcrypt +
cifrado AES-256-GCM de PII (cédula/teléfono/dirección) ✅ · SQL injection ✅ (Sequelize parametrizado) · XSS ✅
(Angular escapa por defecto) · CSRF ✅ (JWT en header, no cookie) · rate limiting ✅ (`limitadorLogin` 10/15min en
login y marcar-codigo, `limitadorMarcacion` 30/15min en marcar-qr) · Helmet ✅ (cabeceras por defecto) · CORS ✅
(`CORS_ORIGIN`, lista separada por comas; sin configurar cae al dominio de Vercel + `localhost:4200` +
`https://localhost` para el WebView de Capacitor) · `trust proxy` habilitado (necesario detrás del proxy inverso
de Railway).

**Revocación de sesiones JWT**: `sesion_valida_desde` (`usuarios`/`operadores`, nullable) se pisa con `NOW()` en
cada reseteo de clave. `verificarAutenticacion` compara contra el `iat` del token (ambos truncados a segundos,
para no invalidar un login hecho en el mismo segundo que el reseteo) - un JWT emitido antes del reseteo queda
401 aunque no haya expirado por tiempo.

**Auditoría técnica** (`registros_auditoria`, append-only): registra reseteo de clave (Usuario/Operador),
edición de clave de Operador, generar/invalidar Token de Hacienda. `objetivo_nombre` queda congelado al momento
de la acción; `actor` es JOIN en vivo. Un fallo al auditar nunca tumba la acción principal. `GET /api/auditoria`
(ADMIN), paginado fijo en 20.

**Registro de dispositivo** (`registros_dispositivo`, append-only, polimórfico): cada login DESDE LA APP
EMPAQUETADA reporta SO/versión/modelo - sirve para ajustar `minSdk` con datos reales del parque de celulares en
vez de estimar.

**Cifrado en reposo** (`utils/cifrado.ts`, AES-256-GCM): `cedula` (determinístico - mismo texto → mismo
resultado, porque tiene UNIQUE y se busca por igualdad) y `telefono`/`direccion` (aleatorio) del Operador.
Transparente vía `get()`/`set()` del modelo. **`CIFRADO_CLAVE`** (32 bytes hex, `openssl rand -hex 32`) es
obligatoria - el proceso no arranca sin ella, y **si se pierde, los datos cifrados quedan irrecuperables para
siempre**. Cualquier `where` de Sequelize que busque por un campo cifrado (ej. chequeo de duplicados) necesita
cifrar el valor buscado A MANO con `cifrarDeterministico()` antes de armar el query - un `where` no pasa por el
`set()` del modelo.

**Pruebas**: unitarias (Vitest, backend y frontend - lógica de negocio extraída a funciones puras: validación de
horas, vigencia de Token, revocación de sesión, cifrado, offline sync, rutas por rol) · integración (`*.itest.ts`,
`supertest` contra Postgres real, BD separada `DB_NAME_TEST`) · end-to-end (Playwright, backend+BD+navegador
reales) · carga (`autocannon`, no corre en CI, contra volumen real de ~950 operadores - hallazgo resuelto:
`GET /asistencia/operadores` sin paginar era el cuello de botella, ya paginado). CI (`GitHub Actions`,
`.github/workflows/ci.yml`): typecheck + unitarias en cada push/PR a `main`, jobs separados para integración y
e2e (cada uno con su propio Postgres de servicio). `Dependabot` semanal en ambos proyectos + Actions.

**Checklist de producción (resumen, ✅ cumple / ⚠️ parcial / ❌ no cumple):** requisitos funcionales ✅ ·
integridad referencial ✅ (FKs + UNIQUE reales) · balanceador de carga ❌ (una sola instancia) · backups de BD
❌ (no configurados - urgente antes de escalar el piloto) · staging ❌ (solo dev y prod) · Sentry/observabilidad
de errores ❌ (solo `console.error`) · uptime monitoring ❌ (existe `/api/health`, nada lo llama) · CI/CD ✅ ·
pruebas (unitarias/integración/e2e/carga) ✅ · Política de Privacidad + gate de aceptación ✅ (datos legales de
FRUGALP AGRICOLA EXPORTADORA G-P CIA. LTDA. completos) · protección de PII ✅ · `npm audit` en 0 en ambos
proyectos (CI) ✅.

## Fotos de evidencia en Cloudflare R2

`foto_r2_key` (`asistencias`, nullable) guarda la key del objeto en R2 en vez del base64 completo en la BD -
reduce el tamaño de la base de datos con cada foto. Solo se sube en la ENTRADA (`procesarMarcacion`,
`prepararFotoParaGuardar`): sube a `asistencias/{operador_id}/{timestamp}.jpg` vía `r2.service.ts` (SDK S3,
compatible con R2); si R2 no está configurado o la subida falla, cae de vuelta a guardar el base64 en
`foto_ingreso` como antes - la marcación nunca falla por un problema de almacenamiento. Lectura
(`obtenerFotoAsistencia`) prioriza `foto_r2_key` (descarga y reconvierte a base64, mismo contrato de API que
antes) y cae a `foto_ingreso` si no hay key - así los registros viejos (pre-R2) siguen funcionando sin migrarlos.
Variables de entorno requeridas en el backend: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET_NAME`. El tier gratis de R2 (10GB/mes, sin costo de egress) se renueva cada mes indefinidamente, no
es una prueba con fecha de vencimiento.

## Infraestructura y despliegue

- **Frontend**: Vercel, autodetección de Angular, dominio estable `https://horometros-frugalp.vercel.app`.
  `environment.ts` (`apiUrl`) apunta al backend de Railway - no hay variable de entorno de Vercel para esto, es
  el archivo el que se edita y se hace push.
- **Backend + Postgres**: Railway, mismo proyecto, comunicados por red privada (`${{Postgres.PGHOST}}`, etc. -
  no exponer Postgres al público salvo tarea puntual, y desactivarlo después). Variables del backend: `NODE_ENV`,
  `JWT_SECRET`, `CIFRADO_CLAVE`, `CORS_ORIGIN`, `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`
  (referenciando el servicio Postgres), `R2_*` (ver arriba). **Pre-deploy Command**: `npm run db:migrate` (corre
  las migraciones pendientes antes de arrancar) - **Custom Start Command**: `npm start`. Con esto, cualquier
  migración nueva se aplica sola en cada deploy, sin pasos manuales.
- **Fotos**: Cloudflare R2 (ver arriba).
- **Empaquetado Android**: Capacitor, `appId: com.frugalp.horometros`, `minSdk 28` (decidido tras auditoría
  MobSF, se ajustará con datos reales de `registros_dispositivo`). Build de **release** firmado (no debug) ya
  compilado y publicado en `frontend-horometros/public/frugalp.apk` (botón de descarga en el login) - repetir
  ese paso (compilar release en Android Studio → reemplazar el archivo → push) en cada versión nueva.
  `android:allowBackup="false"` en el manifest. `capacitor.config.ts` sigue sin `server.url` (webDir empaquetado
  local) - ver "Service Worker" abajo para la decisión pendiente sobre actualizar sin reinstalar.
- **iPhone**: PWA-lite (`manifest.json`, meta tags, "Agregar a pantalla de inicio" en Safari) - sin app nativa,
  evita el Apple Developer Enterprise Program ($299/año).
- **Service Worker** (`@angular/service-worker`, ya instalado y cacheando el shell completo vía
  `ngsw-config.json`): construido como red de seguridad offline ANTES de decidir si `capacitor.config.ts` carga
  el link de Vercel en vivo (para que un redeploy le llegue a todos los celulares sin recompilar el `.apk`).
  **Decisión pendiente del usuario**: `server.url` de Capacitor trae advertencia textual oficial ("not intended
  for use in production") aunque probablemente funcione bien para un piloto chico - alternativa es una
  herramienta de actualización OTA dedicada (Capgo, open source, o Ionic Live Updates), el camino que Capacitor
  sí soporta oficialmente.
- **Offline-first**: solo el Panel de Actividades (crear/finalizar labor) - la ENTRADA/SALIDA siempre necesita
  señal (el código lo valida el backend contra el Token vigente, el QR lo genera el servidor). Cola en
  `@capacitor/preferences`, sincroniza sola al detectar conexión (`@capacitor/network`) o manual. Un fallo de
  red (`status 0`) corta el recorrido de la cola sin perder lo pendiente; un error real del servidor marca ese
  ítem y sigue con el resto.

## Pendiente

- Backups automáticos de la base de datos - no configurados, urgente antes de escalar el piloto.
- Staging, Sentry (o similar) y monitoreo de uptime de `/api/health` - ninguno de los 3 existe todavía.
- Balanceador de carga / redundancia - una sola instancia, aplica en cuanto el piloto crezca a la escala real
  (~950 trabajadores de campo).
- Migrar todas las cuentas de infraestructura (Vercel, Railway, dominio, R2, Sentry/uptime cuando existan) a
  nombre de la empresa cliente antes de la entrega final - no del desarrollador.
- Probar en un iPhone real y 2-3 marcas de Android distintas antes de distribuir a los 950 trabajadores.
- Exportar a Excel + "Imprimir general" en el Directorio de Operadores (diseño de Figma confirmado, sin
  construir - el "Imprimir general" solo se habilitaría con el Historial filtrado a un solo día).
- CRUD de Secciones (fase 2, sin pantalla, campo siempre NULL en `registro_actividad`).
- `usuario.controller.ts` permite a ASISTENTE resetear la clave de cualquier usuario, incluido ADMIN - pendiente
  de decidir si hace falta una jerarquía de roles más estricta.
- "Imprimir Hojas del rango" del Historial solo junta operadores de la página actual de la tabla filtrada, no de
  todas las páginas del rango - suficiente por ahora, revisar si hace falta cubrir el rango completo.

## Ver/Imprimir hoja de actividades

`abrirHojaActividades(grupos, opciones)` abre un modal en la misma pantalla (nunca `window.open`, la app va
empaquetada) con el diseño de la hoja física real. Cada entrada de `grupos` es SIEMPRE un operador en UN solo
día (`{operador, registros, haciendaNombre, fecha, observacionesSupervisor}`) - incluso "Imprimir Hojas del
rango" (varios operadores/días) parte a cada operador en un grupo por día (`agruparPorDia`, asistencia-panel.ts)
en vez de una sola tabla multi-día, porque `observacionesSupervisor` es un dato POR DÍA (`Asistencia.observaciones`,
viaja en el include de `GET /api/registro-actividades/por-operador?operador_id&fecha_inicio&fecha_fin`, ver
`obtenerRegistrosPorOperador`) - antes la impresión por rango no lo mostraba porque no había un único día al que
atribuírselo (bug reportado por el usuario, 2026-10-01). Con esto, las dos entradas (fila del Historial o
"Imprimir Hojas del rango") usan exactamente el mismo diseño de grupo, con su fecha junto al nombre y su propio
pie de Observaciones del Supervisor - ya no hace falta distinguir "modo un día" vs "modo rango" en el template.
Columnas según `operador.rol`: MECANICO ve Equipo/OT/Observaciones/Tiempo estimado/Hora; OPERADOR ve Horómetro
inicio/fin en vez de OT/Hora.

**Mecanismo de impresión global** (`.imprimible`/`.no-imprimir`, `styles.css`): `body *:has(.imprimible) {
display: revert !important; }` restaura toda la cadena de ancestros del nodo imprimible a cualquier profundidad
(evita que `visibility:hidden`/`display:none` en `body *` deje la hoja en blanco o mal paginada) -
`.modal-backdrop` se fuerza a `position:static` en print (un `position:fixed` no pagina bien a varias hojas).
**Máximo 2 reportes (grupos) por hoja física** (pedido del usuario, 2026-10-01): los grupos van envueltos en su
propio contenedor (`.hoja-actividades-grupos`, necesario para que el `:nth-child` cuente limpio sin que la barra
superior corra la numeración) con `break-inside: avoid` en cada uno (un operador con muchas filas nunca se parte
a la mitad - si no cabe completo en lo que queda de la hoja actual, se va entero a la siguiente) más
`break-before: page` antes de cada 3er, 5to, 7mo... grupo, forzando una hoja nueva cada 2 reportes aunque los
anteriores fueran cortos y hubiera cabido uno más. La encapsulación de estilos de Angular (`[_ngcontent-xxx]`)
sube la especificidad del CSS de componente por encima del global - cualquier override de impresión que no
aplique necesita `!important` directo en el CSS del propio componente.

## Historial de Asistencia de un operador (modal desde la Ficha)

Botón "📅 Ver Historial de Asistencia" en la Ficha del Directorio - misma tabla que la pestaña Historial general,
sin columna Operador, con su propio filtro Desde/Hasta. Reusa `obtenerHistorial` con `operador_id` opcional (el
filtro ya existía en el backend, solo le faltaba UI). El carnet QR de la Ficha ("🖨️ Imprimir Carnet") sigue
siendo la única forma de generar un carnet físico nuevo.

## Gestión de Equipo/Actividad (Panel de Asistente)

Pestañas **Equipo** y **Actividad** junto a Directorio/Historial - mismo patrón lista+buscador (tiempo real, sin
botón, debounce 300ms)+paginación+modal que Directorio de Operadores. Roles: ADMIN/ASISTENTE. "Eliminar" es
siempre soft-delete (`paranoid`) - Sequelize excluye automáticamente las filas eliminadas de `findAll` por
defecto, así que los catálogos y selectores quedan filtrados gratis.

**Cuidado real con `paranoid` + includes**: por defecto Sequelize también aplica el filtro paranoid a los
includes - un Operador/Actividad/Equipo eliminado DESPUÉS de generar una Asistencia/RegistroActividad
desaparecería silenciosamente de esos registros ya existentes. Los includes que muestran datos YA REGISTRADOS
(`obtenerAsistenciaHoy`, `finalizarDia`, `obtenerHistorial`, `obtenerRegistrosPorAsistencia`,
`obtenerRegistrosPorOperador`) llevan `paranoid: false` explícito. Los includes de VALIDACIÓN al crear un
registro nuevo se dejan con el comportamiento paranoid por defecto a propósito - un catálogo eliminado sí debe
rechazarse para uso nuevo.

**Importar desde Excel** (botón "📥 Importar", mismo patrón en Equipo/Actividad): el parseo del `.xlsx` ocurre en
el navegador (`excel-importar.util.ts`, paquete `@e965/xlsx` - el `xlsx` de npm quedó congelado con 2 CVEs sin
parche disponible en el registro público). El backend solo recibe el JSON ya mapeado, nunca el archivo crudo.
Reporta fila por fila qué se creó y qué se rechazó (campo faltante, duplicado en BD - incluye duplicados contra
registros soft-deleted, ver arriba -, duplicado dentro del mismo archivo, texto que excede el largo de columna)
en vez de fallar todo-o-nada. Límite 2000 filas por importación.

## Cuenta ADMIN de arranque

`POST /api/usuarios` exige estar logueado como ADMIN, así que el primer Admin se insertó a mano por SQL directo
en la base de producción (huevo y gallina). Usuario `ronald_admin`, cargo `ADMIN`, sin `hacienda_id`.
