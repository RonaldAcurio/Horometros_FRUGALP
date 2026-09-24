# FRUGALP - Sistema de Asistencia

(El nombre del proyecto/repo/BD sigue siendo "Horometros_FRUGALP"/`horometros_db` por historia - el módulo
Horómetros que le daba ese nombre ya no existe, ver "Módulos del sistema" abajo.)

Empresa agrícola. Backend Node/Express + TypeScript + Sequelize sobre PostgreSQL (Render, `dpg-dab9e9ojo6nc739j25ug-a`).
Frontend Angular 22 (standalone components) + Tailwind CSS, desplegado en **Vercel**. El destino final es empaquetar
la app **nativo** (no PWA) para los celulares de Mecánicos/Operadores, pero mientras se construye el Frontend se
prueba directo en el link de Vercel (navegador), no hace falta empaquetar para cada prueba.

Este documento es el briefing de arquitectura para retomar el proyecto en cualquier momento: qué existe, qué reglas
de negocio ya están confirmadas, y qué falta. No es un documento para el usuario final de la app.

## Módulos del sistema

**Asistencia** es el único módulo activo - el que describe todo este documento. El módulo **Horómetros** (OCR con
Gemini para leer horómetros de fotos, `horometros.controller.ts`/`gemini.service.ts`) **se eliminó por completo**
(decisión del usuario, ejecutada - ver "Eliminación del módulo Horómetros (OCR)" más abajo para el detalle de qué
se borró y qué quedó). Las columnas de `Equipo` que eran exclusivas de ese módulo (`ultimo_km_inicial`,
`ultimo_real`, `numero_hoja`, `tiene_tope_10k`, `nombre_maquinaria`) **no se tocaron** - siguen en la tabla, sin
uso, por decisión explícita del usuario de no borrar columnas.

### Eliminación del módulo Horómetros (OCR)

Pedido explícito del usuario: el módulo Horómetros (subía fotos de la hoja física del tractor, las procesaba con
IA vía Gemini y actualizaba `Equipo`/`Ingresos_Semanales`) ya no se necesita dentro de esta app. Era un módulo
autocontenido desde el inicio (nunca compartía componentes/servicios con Asistencia, solo el modelo `Equipo`), así
que se pudo borrar de raíz sin dejar código muerto:

**Backend - borrado:** `controllers/horometros.controller.ts`, `routes/horometros.routees.ts`,
`services/gemini.service.ts` (OCR vía Gemini), `middlewares/upload.middleware.ts` (Multer, sin otro consumidor en
todo el backend), `models/ingresos_semanales.ts` (la tabla de resultados del OCR - el modelo Sequelize se borró,
la tabla en Postgres NO, ver más abajo). `package.json`: se quitaron `@google/genai` y `multer` (+
`@types/multer`) y se corrió `npm install` para limpiar `package-lock.json`.

**Backend - editado:** `app.ts` (el `import`/`app.use('/api/horometros', ...)`), `models/index.ts` (el `import
Ingresos_Semanales`, sus 3 asociaciones con Equipo/Operador/Actividad y su entrada en el `export`). De paso,
`index.ts` perdió una consulta de prueba suelta (`Equipo.findOne({numero_hoja:'33'})` al arrancar, resto de una
prueba manual de cuando se armó el modelo `Equipo` - no era parte de ningún flujo real).

**Frontend - borrado:** carpeta `features/horometros/` completa (`horometros.component.*` +
`components/carga-lote/`), `core/services/horometros.services.ts`, `core/models/horometro.model.ts`. **Editado:**
`app.routes.ts` (la ruta `path: 'horometros'`) y `dashboard.component.html` (la tarjeta "+ Horómetro" entre
"Asistencia" y "Administración" - el Dashboard de ADMIN/ASISTENTE/SUPERVISOR ahora solo tiene 1 o 2 tarjetas).

**Explícitamente NO se tocó** (columnas/tablas en Postgres, por pedido directo del usuario de no borrar ninguna):
- `equipos`: `ultimo_km_inicial`, `ultimo_real`, `numero_hoja`, `tiene_tope_10k`, `nombre_maquinaria` - eran
  exclusivas de Horómetros (las escribía `horometros.controller.ts`, nadie más), quedan como columnas sin uso.
  El modelo Sequelize `Equipo` las sigue declarando (no tenía sentido borrarlas del modelo si la columna sigue
  viva en la BD - dejaría de poder leerlas si alguna vez hicieran falta).
- `ingresos_semanales` (la tabla completa): el modelo Sequelize que la mapeaba se borró (arriba), pero la tabla en
  sí sigue existiendo en Postgres, simplemente ya no la escribe ni lee ningún código de la app. No se corrió
  ninguna migración para eliminarla.

Con esto, "Equipo" pasó a ser un modelo 100% de Asistencia: su CRUD completo vive en `equipo.controller.ts` (lo
usan tanto el Panel de Actividades - solo lectura, `GET /api/equipos` - como la pestaña "Equipo" del Panel de
Asistente, ver "Gestión de Equipo/Actividad + soft-delete").

**Fase 2 de `RegistroActividad` para OPERADOR, construida en la misma ronda**: como parte de este mismo pedido
("no quiero perder las dos columnas donde se ingresa horómetro inicio/fin, que aparezcan solo para OPERADOR"), se
construyó en el Panel de Actividades (`mi-jornada.html`) lo que el modelo `registro_actividad.ts` ya traía
preparado desde antes pero sin UI: los campos `horometro_inicio`/`horometro_final`, visibles únicamente cuando
`esMecanico` es `false` (ver "Panel de Actividades" arriba para el detalle). Se evaluó construir un panel
**separado** exclusivo de OPERADOR para no "saturar de condiciones" el componente compartido - se descartó: el
componente ya tenía exactamente este mismo patrón resuelto para MECANICO (el campo `area`/"OT", con un solo
`*ngIf="esMecanico"`), y todo lo demás de la pantalla (fases código/QR, polling de estado, autocompletar de
Equipo/Actividad, editor de finalizar, salida) es 100% idéntico entre los dos roles - duplicarlo en dos
componentes hubiera significado mantener dos copias de esa lógica compartida por cada cambio futuro, a cambio de
evitarse dos `*ngIf` más. Se prefirió extender el patrón ya existente: un `*ngIf="!esMecanico"` para el input de
horómetro inicial (junto a "Hora de inicio"), otro dentro del editor inline de finalizar para el horómetro final,
y una columna "Horómetro" en la tabla "Labores de hoy" con el mismo guard.

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

## Dos caminos de entrada a la jornada (Mecánico/Operador) - unificados en el login

**Decisión de diseño de esta ronda:** cuál camino le toca a un trabajador NO es una elección manual del Supervisor en
el frontend ni un campo aparte en la BD - se deriva automáticamente de si la hacienda de ese trabajador tiene ahora
mismo un **Token de Hacienda vigente** (`hacienda.token_actual` + `token_expira_en` en el futuro). El propio
`POST /api/auth/login` lo calcula y lo manda en el perfil como `hacienda_requiere_codigo: boolean`
(`auth.controller.ts`, rama `operador`) - así el frontend nunca tiene que adivinar ni ofrecer los dos caminos a la
vez: **es estricto**, uno u otro, decidido en el momento exacto del login. Si el Supervisor genera un Token hoy, sus
trabajadores ven código; si lo deja vencer, ven QR - sin que nadie tenga que tocar un "modo" a mano en ningún lado.

### Camino A - Código (haciendas con Token de Hacienda vigente)

Dos variantes del mismo núcleo (comparten `procesarMarcacion`):
- `POST /api/asistencia/marcar-codigo` (público, sin JWT): el kiosco clásico sin login, donde el trabajador teclea
  usuario+clave+Token de Hacienda desde cero. Sigue existiendo para dispositivos compartidos que no quieren manejar
  sesiones.
- `POST /api/asistencia/marcar-mi-codigo` (autenticado, tipo `operador`): la pantalla **"mi jornada"** del propio
  trabajador (`mi-jornada.ts`, fase `codigo`) - ya se logueó con usuario+clave una sola vez (`POST /api/auth/login`),
  así que aquí solo confirma el Token de Hacienda, sin volver a escribir su clave. Marca al instante (entrada o
  salida, `procesarMarcacion` decide cuál según si ya tiene jornada abierta y lo dice explícito en la respuesta,
  `tipo: 'ENTRADA' | 'SALIDA'`).
  - **ENTRADA**: lleva al Panel de Actividades (`entrarAActividades()`), **igual que el camino QR** - el código
    solo reemplaza la forma de marcar presencia, no le quita al trabajador la posibilidad de registrar sus
    labores del día. (Antes terminaba la sesión de inmediato tras la entrada, sin dejarlo entrar al panel - el
    usuario reportó esto como que "no lo dejaba trabajar", se corrigió esta ronda.)
  - **SALIDA**: sigue terminando la jornada de una vez (fase `terminado`, con un botón explícito "Cerrar sesión" -
    antes se cerraba sola la sesión con un `setTimeout` de 4s, se sentía como un error/redirect inesperado al
    login, se quitó a favor de que el propio trabajador decida cuándo cerrar; mismo criterio en las 3 fases que
    llegan a `terminado`: código, detección de salida por QR, y salida olvidada). Se dispara con el botón
    "🔚 Marcar salida" del Panel de Actividades (`marcarSalida()`, que por código vuelve a **pedir el código desde
    cero** - no reutiliza el de la entrada, porque el código prueba presencia física en el momento, tanto a la
    entrada como a la salida - y por QR vuelve a mostrar el QR flotante). Un refresco de página con jornada ya
    abierta (código o QR) siempre vuelve al Panel de Actividades, nunca fuerza la pantalla de salida - la salida
    es una acción explícita del trabajador, no algo que se infiera solo por volver a abrir la pantalla.

Si el trabajador marca en una hacienda que no es la suya, el sistema lo autoadmite bajo el Supervisor de esa
hacienda (reemplaza "admitir externo" para este camino, porque el Token ya probó la presencia física).

### Camino B - Login + QR de sesión (haciendas SIN Token de Hacienda vigente)

`GET /api/asistencia/mi-qr` + `POST /api/asistencia/marcar-qr-sesion`. El trabajador se loguea (una sola vez), y ya
logueado, la pantalla **"mi jornada"** (fase `qr`) le muestra su propio QR de jornada en bucle - **obligatorio**,
no hay forma de saltárselo: alguien más (Supervisor o Escáner, desde `/asistencia/escanear`, ver más abajo) tiene que
escanearlo. El QR **no** es su `operador_id` fijo: es un JWT corto y aparte (`qr_token`, 90s de vigencia, tipo
`qr_jornada`) que el frontend vuelve a pedir y redibujar en bucle mientras está en pantalla - una foto/captura deja
de servir en menos de 2 minutos (reemplaza el viejo esquema "QR = operador_id", reusable indefinidamente).

Una vez escaneado (entrada), `mi-jornada.ts` detecta el cambio por **polling** de `GET /api/asistencia/mi-estado`
(cada 5s, endpoint nuevo de esta ronda) y pasa sola a la fase `actividades` (Panel de Actividades, ver abajo). Para
la salida, el trabajador pulsa "Marcar salida" (vuelve a mostrar el QR) y **también** tiene que ser escaneado de
nuevo - no hay salida sin escaneo, es la misma regla que la entrada.

**La salida por QR de sesión NO vuelve a pedir actividades** (corrección de esta ronda): al escanear una salida,
`marcarConQrSesion` detecta que ya hay una jornada abierta y, en vez de exigir que quien escanea elija actividades a
mano (`require_actividad`, el comportamiento original heredado del carnet físico), **deriva la lista directamente
de los `RegistroActividad` que el trabajador ya cargó en el Panel de Actividades** durante el día - así el resumen
que ve el Supervisor (`AsistenciaActividad`) sigue quedando poblado, sin el cuadro redundante de "selecciona una
actividad" que ya no tiene sentido si el trabajador ya las registró una por una. Este cambio es **exclusivo del
Camino B** (`omitirActividadRequerida` en `ContextoMarcacion`) - el kiosco físico y el Camino A (código) siguen
exigiendo elegir actividad al marcar salida, porque esos caminos no tienen Panel de Actividades detrás.

**Autoservicio "Salida Olvidada"** (`POST /api/asistencia/marcar-salida-olvidada`, nuevo endpoint de esta ronda):
antes, `estado: 'SALIDA_OLVIDADA'` solo lo ponía el Supervisor en bloque al cerrar el día (`finalizarDia`) - el
trabajador no tenía ninguna forma de cerrar su propia jornada si no lograba volver a un punto de escaneo ni
reingresar el código (ej. sale muy tarde y ya se fue a su casa). Ahora `mi-jornada.ts` ofrece un link discreto
("¿No puedes llegar a un punto de control?" / "No podré escanear hoy" / "¿No tienes el código...?") en las 3 fases
donde puede hacer falta - `qr` (cuando ya es una salida), `codigo` (idem) y `actividades` - que llama a este
endpoint directamente: cierra la jornada como `SALIDA_OLVIDADA` con la hora del clic (opcionalmente editable, mismo
patrón que `hora_inicio`/`hora_fin` del Panel de Actividades) y desloguea. El Supervisor la ve igual que las que
él mismo cierra en bloque - queda congelada (no se puede hacer O/X ni editar, mismo trato que `FINALIZADO`).

### El carnet físico (kiosco público) sigue existiendo, sin cambios

`POST /api/asistencia/marcar-qr` (sin autenticación, `marcacion-kiosco.ts`, ruta `/asistencia/marcacion`) es el
flujo clásico original: alguien escanea el carnet QR impreso del trabajador, sin que nadie tenga que loguearse. No
se tocó en esta ronda - sigue siendo el único camino que no pasa por `procesarMarcacion` vía sesión de nadie.
Los 4 caminos (kiosco, código público, código autenticado, QR de sesión) comparten el mismo núcleo de lógica de
entrada/salida (`procesarMarcacion` en `asistencia.controller.ts`), para no triplicar reglas como el cruce de
medianoche.

### Panel de Actividades (ambos caminos, código y QR)

Una vez con la jornada abierta (código o QR, ver "Camino A"/"Camino B" arriba), el trabajador entra al Panel de
Actividades de su propia jornada (`mi-jornada.ts`, fase `actividades`): registra labores puntuales contra el
catálogo de **Equipos** (`GET /api/equipos`, endpoint de solo lectura - el CRUD completo de Equipo vive en
`equipo.controller.ts`, compartido con la pestaña "Equipo" del Panel de Asistente) y **Actividades**
(`GET /api/actividad`), usando el modelo `RegistroActividad` que ya existía en el backend sin frontend
(`registro_actividad.controller.ts`). El formulario cambia de campo según el rol de quien inició sesión
(`esMecanico = perfil.rol !== 'OPERADOR'`, ver `mi-jornada.ts`):
- **MECANICO**: campo `area`, con la etiqueta "OT" (Orden de Trabajo).
- **OPERADOR**: campos `horometro_inicio` (al iniciar la labor, etiqueta "Horómetro inicial") y `horometro_final`
  (al finalizarla, dentro del mismo editor inline de la hora de fin, etiqueta "Horómetro final") - ambos
  opcionales, sin validación de que uno sea mayor que el otro (mismo criterio que `area`: campo de captura libre,
  sin reglas de negocio extra que el usuario no pidió). La tabla "Labores de hoy" gana una columna "Horómetro"
  (`inicio / final`) solo quien no sea MECANICO la ve. `seccion_id` sigue sin UI (fase 2, siempre en NULL).

**Selectores como autocompletar**: ambos catálogos pueden crecer, así que Equipo/Actividad de este panel no son
un `<select>` sino un input de texto + lista desplegable (`abrirOpcionesEquipo`/`onBuscarEquipo`/
`seleccionarEquipo` y sus equivalentes de Actividad) - el trabajador escribe y van apareciendo las coincidencias
(con debounce de 300ms), y un link "Cargar más" al fondo de la lista trae la siguiente página de la MISMA
búsqueda. Cambiar el texto sin volver a elegir una opción borra la selección anterior (`nuevoRegistro.equipo_id`/
`actividad_id` vuelve a `null`), para no mandar un id que ya no corresponde a lo que se ve escrito - el botón
"Iniciar labor" se deshabilita en ese caso. `GET /api/equipos` siempre responde paginado
(`{data, total, pagina, totalPaginas}`, mismo patrón que `obtenerAsistenciaHoy`) y acepta `q` opcional para
filtrar por `codigo_megued`/`nombre_equipo` (`ILIKE`) - es el único consumidor de este endpoint. `GET /api/actividad`
es compartido (lo usan también el kiosco y el checklist de salida del camino código, que sí quieren ver el
catálogo completo de una vez como checklist, no autocompletar) - por eso ahí la paginación (y el filtro `q`) son
opcionales: sin `pagina`/`limite` en la query responde el arreglo plano de siempre; con cualquiera de los dos,
paginado, y `q` (si viene) filtra por `codigo_megued`/`description`. `mi-jornada.ts` mantiene dos catálogos de
actividades separados por esto: `actividadesCatalogo` (completo, checklist de salida) y
`actividadesCatalogoPanel` (paginado/buscable, este selector).

**`hora_inicio`/`hora_fin` de cada labor son editables, a propósito** (decisión de negocio: el trabajador puede
estar cargando esto en su tiempo libre, después de haber hecho la labor, así que necesita poder decir "esto lo hice
a tal hora" en vez de que el sistema le imponga el momento exacto del clic). Ambos campos son opcionales en
`crearRegistroActividad`/`finalizarRegistroActividad` (si no vienen, caen al comportamiento de antes: la hora del
servidor en ese instante) y se validan: `hora_fin` tiene que ser posterior a `hora_inicio` de esa misma labor, o
el backend responde 400. **Esto es un concepto totalmente aparte** de `hora_ingreso`/`hora_salida` de la
`Asistencia` (la jornada completa - esas las pone el QR/código al marcar entrada/salida, y las ve el Supervisor en
su panel; si el trabajador nunca marca salida, esa jornada queda `SALIDA_OLVIDADA`, ver Tablas) - no hay que
confundir "cuánto duró la jornada completa" con "cuánto duró CADA labor dentro de ella".

**Los inputs de hora son DOS `<input type="number">` (HH y MM), no un `<input type="time">` nativo** - la labor
siempre es de HOY, no hace falta selector de fecha/calendario, y el widget nativo de hora tiene un bug de UX real
que se encontró y confirmó con pruebas: es un control compuesto de 3 "segmentos" internos (hora/minuto/am-pm), y
un clic en CUALQUIER punto del input NO enfoca siempre el segmento de la hora - basta con que el clic caiga sobre
el segmento de minutos o AM/PM (muy fácil en un input ancho, donde la mayor parte del área no corresponde a
ningún segmento útil) para que lo que se teclee después vaya a ESE segmento en vez de a la hora que el trabajador
cree estar editando. Resultado: guarda una hora distinta a la que ve escrita, o el backend la rechaza por quedar
antes de la hora de inicio - el usuario lo reportó como "no me deja poner la hora finalizada". Dos inputs
separados (`horaInicioHH`/`horaInicioMM`, `horaFinHH`/`horaFinMM` en `mi-jornada.ts`), cada uno con un solo
propósito, eliminan la ambigüedad por completo. `horaComponentesAIso(hh, mm)` combina ambos con la fecha de hoy y
manda un ISO completo (con `Z`) al backend - **nunca el string crudo del input**. (Esto reemplaza un intento
anterior con un solo `<input type="time">`: correcto en la conversión de zona horaria, pero seguía teniendo el
bug de UX del widget nativo.) Antes de la conversión a ISO explícita, el backend, en OTRA zona horaria que el
dispositivo del trabajador, reinterpretaba mal un string sin zona (`new Date("...")` sin offset se lee como hora
local de quien lo parsea, no de quien lo escribió) y la hora guardada quedaba desfasada varias horas frente a lo
que el trabajador realmente escribió - bug real reportado y confirmado con pruebas cruzando zonas horarias.

**Bug relacionado pero distinto** (mismo reporte del usuario, "la fecha con la zona horaria"): los mensajes
`"Bienvenido! Entrada registrada a las..."` / `"Hasta Luego! Salida registrada a las..."` que arma
`procesarMarcacion` (asistencia.controller.ts) usaban `ahora.toLocaleTimeString('es-EC')` **sin** `timeZone`, que
solo fija el idioma/formato del texto, no la zona horaria - sin eso, `toLocaleTimeString` usa la zona horaria del
SERVIDOR (Render corre en UTC), no la de Ecuador. Un trabajador marcando a las 7am Ecuador veía "Entrada
registrada a las 12:00 p.m." Se corrigió agregando `{ timeZone: 'America/Guayaquil' }` (mismo patrón que
`getFetchLocalEcuador`/`getFechaLocalEcuador`, que sí lo tenían bien desde antes).

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
- Aplica solo a rutas de cara al propio Operador: `GET /api/asistencia/mi-qr` y `POST /api/asistencia/marcar-mi-codigo`.
  No aplica a `GET /api/asistencia/mi-estado` a propósito - ese endpoint reporta el estado tal cual está, incluido
  "ya se cerró" (lo usa la pantalla del QR flotante para detectar la salida), cortarse a sí mismo no tendría sentido.
  Tampoco aplica a rutas de oficina.

## O/X - Confirmación de asistencia del Supervisor

Al lado de cada trabajador que aparece logueado hoy en su panel, el Supervisor confirma si de verdad vino:
`PUT /api/asistencia/:id/confirmar` con `{ presente: boolean }`.

- **O (`presente:true`)**: solo marca `confirmado_por_supervisor = true`.
- **X (`presente:false`)**: además mueve `estado` a `OBSERVANDO` y **genera una observación automática** con fecha/hora
  ("Marcado como NO presente por el supervisor"). Esto es lo que atrapa el caso de que alguien pase su código/QR a un
  compañero que no llegó a trabajar - `OBSERVANDO` también corta su sesión (ver arriba) y lo saca del Historial oficial
  (que solo muestra `FINALIZADO`/`SALIDA_OLVIDADA`).
- **A diferencia de `revisarAsistencia` (edición de observaciones/hora_salida), esto SÍ funciona aunque el registro
  ya esté cerrado** (`FINALIZADO`/`SALIDA_OLVIDADA`) - decisión de negocio: la confirmación del Supervisor es su
  observación directa de la realidad (¿vio o no vio a ese trabajador hoy?), independiente de si el sistema ya
  cerró esa jornada. El Token de Hacienda puede circular entre trabajadores sin que el Supervisor lo note al
  momento de marcar, así que necesita poder decir "esto no fue real" incluso después de cerrado - de hecho X sobre
  un registro cerrado lo **reabre** a `OBSERVANDO`, justo el comportamiento buscado.

**Frontend**: botones O/X en la columna "Confirmar" de `supervisor-panel` (`confirmarPresencia()`), al lado de
cada fila, **nunca deshabilitados por el estado del registro** (a propósito, ver arriba). El botón O se aplica
directo (bajo riesgo, reversible con otro clic); el X pide confirmación con `ConfirmacionService.preguntar()`
antes de mandar la petición, porque mueve el registro a `OBSERVANDO` y deja la nota automática. El botón de
Observación (edición de texto libre) se congela a nivel de **día completo** (`diaCerrado`), no por el estado de
cada fila puntual - ver el bloque de `calcularDiaCerrado` más abajo, es el mismo motivo que "Cerrar Jornada".

**"Cerrar Jornada" exige que TODOS estén confirmados primero** - decisión de negocio (el usuario lo pidió
explícitamente): si el cierre de día se pudiera hacer sin que el Supervisor haya revisado O/X a cada trabajador,
el chequeo de O/X no serviría de nada - bastaría con que un trabajador se autocierre (`SALIDA_OLVIDADA`,
autoservicio) sin que el Supervisor lo haya visto nunca para que "el día ya está cerrado" y nadie note nada raro.
`calcularDiaCerrado(fecha)` (helper compartido en `asistencia.controller.ts`) es la fuente única de verdad: un
día está cerrado cuando NINGÚN registro de esa fecha sigue `EN_JORNADA`/`PENDIENTE_REVISION` Y NINGUNO tiene
`confirmado_por_supervisor: null`. Tres consumidores:
- `diaCerrado` (`obtenerAsistenciaHoy`) - controla el botón "Cerrar Jornada" (habilitado/"🔒 Jornada Cerrada").
  Mientras falte confirmar a alguien, el botón sigue mostrando "🔒 Cerrar Jornada" (habilitado), aunque todos los
  trabajadores ya hayan cerrado su propia jornada.
- `finalizarDia` valida esto ANTES de tocar nada: si hay algún registro del día con `confirmado_por_supervisor:
  null`, responde 400 con `{ message: "Falta confirmar (O/X) la asistencia de: <nombres>.", faltan_confirmar:
  [...] }` (nombres reales del `Operador`, vía el include de la consulta) y no cierra nada. El frontend no
  necesitó cambios para mostrar esto - `ejecutarCierreDiario()` ya mostraba `err.error?.message` tal cual.
- `revisarAsistencia` (edición de Observación/hora_salida) - **congelado a nivel de día completo, no por fila**:
  antes miraba solo el `estado` de ESE registro puntual (`FINALIZADO`/`SALIDA_OLVIDADA`), lo que congelaba la
  Observación de un trabajador que se autocerró mucho antes de que el Supervisor terminara de revisar a los
  demás - el usuario lo reportó explícitamente ("las observaciones se tienen que cerrar solo cuando se CIERRE
  JORNADA"). Ahora usa `calcularDiaCerrado(asistencia.fecha)`: la Observación de CUALQUIER fila sigue editable
  mientras el día siga abierto, sin importar si esa fila en particular ya está en un estado terminal.

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
  jornada) - el backend ya existía (`registro_actividad.controller.ts`/`.rutes.ts`); el frontend (`mi-jornada.ts`,
  fase `actividades`) usa ya los campos de MECANICO (`area`) y de OPERADOR (`horometro_inicio`/`horometro_final`) -
  solo `seccion_id` sigue sin UI (ver "Panel de Actividades" arriba).
- ~~`asistencias.diesel_consumido`~~: columna sin usar en ningún controlador ni en el frontend - se sacó del modelo
  Sequelize (`asistencias.ts`) en la auditoría de código suelto de esta ronda. La columna sigue existiendo en la BD
  (no se tocó ninguna migración), simplemente Sequelize ya no la conoce.

## Frontend (estado real, revisado directo del repo)

Angular 22 standalone (sin NgModules), Tailwind CSS, `@zxing/ngx-scanner` (lectura de cámara) + `qrcode` (generación
de QR), HttpClient con interceptor de auth, testing con Vitest. Rutas por `loadComponent` (lazy), con guards.

### Ruteo por rol: cada rol tiene su propia "casa", nunca un menú compartido con `*ngIf`

Decisión de esta ronda, en respuesta a un hueco real (ESCANER y MECANICO/OPERADOR terminaban viendo el Dashboard de
oficina y el menú de 3 tarjetas de Asistencia, sin deberían). `rutas-por-rol.ts` centraliza en una sola función
(`rutaHomePorRol(perfil)`) a dónde pertenece cada rol - la usan el login (a dónde navegar tras autenticarse),
`roleGuard` (a dónde mandar a quien no tiene el rol de la ruta - **nunca** un `/dashboard` fijo, que además causaría
un loop de redirects para roles sin Dashboard), `homeRedirectGuard` (rutas `''` y `**`) y el botón "Menú" del header:

| Rol | Ruta hogar | Qué ve |
|---|---|---|
| ADMIN, ASISTENTE, SUPERVISOR | `/dashboard` | Menú con tarjetas (Asistencia, + Administración si aplica) |
| ESCANER | `/escaner` | Un solo botón "📷 Escanear" (ver abajo) |
| MECANICO, OPERADOR | `/mi-jornada` | Código o QR flotante, según su hacienda (ver arriba), después Panel de Actividades |

`/dashboard` lleva `roleGuard('ADMIN','ASISTENTE','SUPERVISOR')` (antes solo `authGuard`, cualquier rol logueado
entraba) - ESCANER y MECANICO/OPERADOR nunca tuvieron necesidad real de esa pantalla. (`/horometros` existió con
el mismo guard, pero la ruta y el módulo entero se eliminaron - ver "Eliminación del módulo Horómetros (OCR)".)

**Ya construido:**
- `dashboard` - menú principal (Asistencia, + "Administración" si el rol es ADMIN o ASISTENTE). Solo
  ADMIN/ASISTENTE/SUPERVISOR llegan aquí (ver tabla de arriba).
- `asistencia-menu` - submenú del módulo Asistencia con las 3 tarjetas (Gestión de Personal / Punto de Marcación /
  Panel de Supervisor). Solo lo ve tal cual el ADMIN: `/asistencia` tiene el guard `asistenciaRedirectGuard`, que
  manda a cada otro rol directo a SU panel (SUPERVISOR → `/asistencia/supervisor`, ASISTENTE → `/asistencia/asistente`,
  ESCANER/MECANICO/OPERADOR → su propia ruta hogar, por si alguien escribe `/asistencia` a mano) sin pasar por el
  menú - corrige un bug real donde un SUPERVISOR podía entrar al panel de la Asistente solo porque el menú no
  distinguía roles. Los 3 paneles además llevan `roleGuard` propio (`/asistencia/asistente` → ADMIN/ASISTENTE,
  `/asistencia/supervisor` → ADMIN/SUPERVISOR) para que esto no dependa solo de la navegación.
- `escaner-menu` (`/escaner`, rol ESCANER únicamente) - **un solo botón**, a propósito (pedido explícito del
  usuario): "📷 Escanear" lleva a `/asistencia/escanear`. El botón "Menú" del header siempre vuelve aquí, lo que
  desmonta el componente de escaneo y apaga la cámara sola (`ngOnDestroy`) - así el dispositivo "descansa la
  cámara" sin cerrar sesión, sin necesitar ningún botón especial de "pausa".
- `escaneo-sesion` (`/asistencia/escanear`, ADMIN/SUPERVISOR/ESCANER) - escaneo **autenticado** del QR flotante de
  Camino B (`marcar-qr-sesion`), distinto del kiosco público de abajo (que escanea el carnet físico con
  `marcar-qr`). Estructuralmente calcado del kiosco (misma lógica de cámara/evidencia) pero mantenido aparte porque
  son 2 caminos de negocio distintos, no el mismo flujo - queda anotado como candidato a unificar más adelante si
  hace falta (ver Pendiente). Lo usan el botón "📷 Escanear" del Panel de Supervisor y el único botón de ESCANER.
- `marcacion-kiosco` (`/asistencia/marcacion`, público) - el flujo clásico de escaneo de carnet físico (cámara al
  40%, captura de evidencia). Sin guard a propósito: el trabajador lo usa SIN loguearse. **No se tocó en esta
  ronda** - sigue siendo un camino totalmente aparte del QR de sesión.
- `supervisor-panel` - validación diaria, observaciones, Finalizar Día, botón "📷 Escanear" hacia `/asistencia/escanear`.
- `asistencia-panel` - Directorio de Operadores (+ credenciales usuario/clave/supervisor_id) e Historial de
  Asistencia con filtro de fecha (rol Asistente).
- `mi-jornada` (`/mi-jornada`, rol MECANICO/OPERADOR únicamente) - pantalla única y cautiva (sin botón "Menú": no
  hay a dónde más ir). 3 fases internas según el estado real, nunca las 3 a la vez:
  1. **`codigo`** (hacienda con Token vigente): input de código, confirma con `marcar-mi-codigo`. La respuesta
     dice `tipo: 'ENTRADA' | 'SALIDA'` - con ENTRADA pasa directo al Panel de Actividades (fase `actividades`,
     ver abajo); con SALIDA (el backend respondió pidiendo actividad porque ya tenía jornada abierta) muestra el
     mismo selector de actividades que el kiosco, confirma, y pasa a fase `terminado`: mensaje de cierre + botón
     explícito "Cerrar sesión" (ya no hay logout automático, ver arriba en Camino A).
  2. **`qr`**: QR flotante que se auto-regenera cada 80s (vence a los 90s) + cuenta regresiva visible. Hace
     **polling de `GET /api/asistencia/mi-estado` cada 5s** para detectar que lo escanearon, sin que el trabajador
     tenga que hacer nada.
  3. **`actividades`** (Panel de Actividades, **ambos caminos** - código y QR): formulario para iniciar una labor
     (equipo + actividad + área si es MECANICO + hora de inicio editable, solo `time` sin calendario + observaciones)
     y tabla de labores del día con botón "Finalizar" por labor (editor inline con la hora de fin, también editable
     - ninguna de las 2 horas se le impone al trabajador, puede estar cargando esto más tarde). Botón
     "🔚 Marcar salida" (`marcarSalida()`) según el camino: código vuelve a fase `codigo` a pedir el código desde
     cero (no reutiliza el de la entrada); QR vuelve a mostrar el QR flotante (fase `qr`) para que lo vuelvan a
     escanear - el mismo polling de estado detecta la salida y pasa a fase `terminado`. Ninguna de las 2 salidas
     pide elegir actividades otra vez salvo que el backend lo exija (código: siempre; QR: nunca, ver "Camino B").
  Al entrar (`ngOnInit`), consulta `mi-estado` ANTES de decidir la fase inicial - si el trabajador ya tenía una
  jornada abierta (refrescó la página, entrada nueva, o se desconectó y volvió), **siempre** va directo al Panel
  de Actividades, sin importar el camino - la salida es una acción explícita del trabajador (el botón de arriba),
  nunca algo que se infiera solo por volver a abrir la pantalla.
  **Autoservicio "Salida Olvidada"**: link discreto en las fases `qr` (solo si ya es una salida), `codigo` (solo
  si ya es una salida) y `actividades`, para cuando el trabajador no va a poder cerrar su jornada por el camino
  normal (ver "Autoservicio Salida Olvidada" arriba).
- `modal-actividad`, `visor-foto` - piezas compartidas (selector de actividades en la salida, ventana flotante de
  evidencia). `modal-actividad` ahora lo reusan 3 componentes: `marcacion-kiosco`, `escaneo-sesion` y `mi-jornada`.
- `login` (`/login`) - pantalla única (usuarios + operadores), con `AuthService` (signals: `token`/`perfil`),
  `authGuard`/`guestGuard`/`roleGuard`, e interceptor que agrega el JWT a cada request y desloguea solo en un 401.
  Tras un login exitoso, navega a `rutaHomePorRol(perfil)` - nunca a `/dashboard` fijo (ver tabla de arriba). El
  formulario en sí sigue siendo solo usuario+clave: el código de hacienda (si aplica) se pide después, ya
  autenticado, en `mi-jornada`.
- `admin-panel` (`/admin`, ADMIN y ASISTENTE) - pestaña **Usuarios** (crear ADMIN/ASISTENTE/SUPERVISOR/ESCANER con
  clave, selector de hacienda solo si el cargo la necesita, resetear clave) y pestaña **Haciendas** (crear hacienda
  nueva, generar/invalidar su Token) - esta segunda pestaña **solo visible para ADMIN**, un Asistente no la ve.
- `NotificacionService`/`<app-toast>` y `ConfirmacionService`/`<app-confirm-modal>` (montados una vez en `app.html`) -
  reemplazan `alert()`/`confirm()` nativos del navegador en TODO el proyecto (no tienen sentido en una app
  empaquetada nativo). Todo campo de clave tiene su "ojito" para mostrar/ocultar.

**Botón "Menú" del header (`app.ts`):** calcula `rutaHomePorRol(perfil)` en cada navegación y:
- MECANICO/OPERADOR: el botón **no se muestra** (`mostrarBotonMenu = false`) - pantalla cautiva, no hay a dónde ir.
- ESCANER: siempre apunta a `/escaner` (oculto si ya está ahí).
- ADMIN en `/asistencia/*`: apunta a `/asistencia` (el menú de 3 tarjetas, tiene sentido para ese rol).
- Cualquier otro caso: apunta a la ruta hogar del rol, oculto si ya está en ella.
Antes apuntaba a un `/dashboard` fijo en varias ramas - roto para ESCANER/MECANICO/OPERADOR desde que dejaron de
tener Dashboard, y para roles de un solo panel (ej. Asistente en su propio panel) el botón "no hacía nada" porque
`asistenciaRedirectGuard` lo rebotaba al mismo sitio (bug real reportado y corregido).

**Detalle técnico importante para el que siga tocando componentes nuevos:** esta app necesita
`ChangeDetectorRef.detectChanges()` explícito después de cada respuesta HTTP que mute un campo plano (no-signal) del
componente - el zone.js de este proyecto no lo dispara solo. Es el patrón que ya usa TODO el código existente
(`cargarOperadores`, `guardarObservacion`, etc.); si un componente nuevo lo omite, la UI se actualiza mal en
silencio (se descubrió así un bug real: los modales de "Nuevo Usuario"/"Nuevo Operador" no se cerraban tras guardar).
Los `signal()` (usados para toggles de UI como mostrar/ocultar clave, o los estados de `NotificacionService`/
`ConfirmacionService`) sí se actualizan solos, sin necesitar este truco.

**Otro detalle importante para quien agregue una columna UNIQUE nueva:** `crearOperador`/`actualizarOperador`
(`codigo_megued`, `cedula`) y `crearUsuario` (`usuario`) ahora chequean el duplicado ANTES del INSERT/UPDATE
(`verificarDuplicadosOperador`) y devuelven un 409 con un mensaje que nombra el campo, el valor y quién ya lo tiene
(ej: `La cédula "1111111111" ya está registrada a nombre de Juan Pérez.`) - el catch general también traduce
cualquier `SequelizeUniqueConstraintError` que se escape (condición de carrera) al mismo tipo de mensaje, en vez de
devolver el error crudo de Sequelize/Postgres (que además exponía SQL y parámetros en la respuesta al cliente - un
detalle de seguridad, no solo de UX). Antes de este fix, crear/editar con un dato duplicado tumbaba con un 500
genérico sin decir cuál campo chocaba ni con quién (bug real reportado por el usuario).

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
| GET /api/asistencia/mi-estado | operador | El propio Operador consulta si ya tiene jornada EN_JORNADA hoy (lo usa mi-jornada para detectar el escaneo por polling). |
| POST /api/asistencia/marcar-mi-codigo | operador, jornada activa | Camino A para un Operador YA logueado - solo confirma el Token de Hacienda, sin re-pedir su clave. |
| POST /api/asistencia/marcar-salida-olvidada | operador, jornada activa | Autoservicio: el trabajador cierra su propia jornada como SALIDA_OLVIDADA cuando no puede escanear ni reingresar el código. |
| POST /api/asistencia/marcar-qr-sesion | ADMIN, SUPERVISOR, ESCANER | Camino B paso 2: valida el QR y marca (desde `/asistencia/escanear`). |
| PUT /api/asistencia/:id/confirmar | SUPERVISOR, ADMIN | O/X de asistencia. |
| GET /api/asistencia/hoy | ADMIN, SUPERVISOR | Reporte del día, paginado. |
| POST /api/asistencia/finalizar-dia | ADMIN, SUPERVISOR | Cierra jornada (⚠️ todavía no filtra por hacienda, ver Deuda técnica). |
| GET /api/asistencia/historial | ADMIN, ASISTENTE | Historial con filtros de fecha. |
| PUT /api/asistencia/revisar/:id | ADMIN, SUPERVISOR | Ajustes del Supervisor sobre un registro. |
| GET /api/asistencia/:id/foto | ADMIN, ASISTENTE, SUPERVISOR | Trae solo la foto de un registro (VisorFoto, compartido por ambos paneles). |
| POST /api/asistencia/admitir-externo | SUPERVISOR, ADMIN | Reclama a un trabajador prestado. |
| GET /api/actividad | público | Catálogo de actividades - sin JWT **a propósito**, lo usa el kiosco (modal-actividad) al marcar salida. Sin `pagina`/`limite` en la query responde el arreglo completo (de siempre); con cualquiera de los dos, paginado (lo usa el selector del Panel de Actividades). |
| GET /api/actividad/:id | público | Idem, una sola actividad. |
| POST /api/actividad/nueva | ADMIN | Crea una actividad del catálogo (sin UI todavía, ver Pendiente). |
| PUT /api/actividad/:id | ADMIN | Edita una actividad del catálogo. |
| DELETE /api/actividad/:id | ADMIN | Elimina una actividad del catálogo. |
| GET /api/equipos | cualquier cuenta logueada | Catálogo de Equipos, solo lectura - siempre paginado (`pagina`/`limite`, default 1/20), lo usa el selector del Panel de Actividades. El CRUD completo es `POST`/`PUT`/`DELETE /api/equipos` (ver "Gestión de Equipo/Actividad + soft-delete"). |
| GET /api/haciendas | ADMIN, SUPERVISOR, ASISTENTE | Lista haciendas (id, nombre, token vigente). |
| POST /api/haciendas | ADMIN | Crea una hacienda nueva. |
| POST /api/haciendas/:id/token | ADMIN, SUPERVISOR (solo la suya) | Genera/regenera el Token de Hacienda. |
| DELETE /api/haciendas/:id/token | ADMIN, SUPERVISOR (solo la suya) | Invalida el Token antes de tiempo. |

**Auditoría de accesos (cerrada):** hasta esta ronda, `operadores`, `hoy`, `finalizar-dia`, `historial`, `revisar/:id`,
`:id/foto` (en `asistencia.rutes.ts`) y las mutaciones de `actividad` no tenían
`verificarAutenticacion` ni `requireRol` - cualquiera que conociera la URL podía llamarlas sin loguearse. Quedó
documentado como deuda "temporal" desde antes del Login, pero el Login ya existe hace rato y nunca se cerró. Cada
ruta arriba quedó con el mismo rol que ya la protegía en el frontend (roleGuard/`*ngIf` de cada panel) - no se
inventó ningún permiso nuevo, solo se hizo cumplir en el backend lo que el frontend ya asumía. Se probó con curl
(401 sin token, 403 con rol equivocado, pasa con el rol correcto) y con Playwright contra los 3 paneles para
confirmar que ningún flujo real se rompió. `marcar-qr`, `marcar-codigo` y el catálogo de `actividad` (GET) siguen
públicos **a propósito**: los usa el kiosco sin login.

## Auditoría de código suelto (esta ronda)

Pedido explícito del usuario: revisar y dejar solo lo que se usa, sin redundancia. Se investigó con un agente de
solo-lectura (rutas duplicadas, componentes/imports huérfanos, bloques comentados, exports sin enrutar) y se aplicó
lo confirmado:

- **Ruta muerta**: `app.routes.ts` tenía DOS entradas `path: 'asistencia'` - la segunda (un `redirectTo`) nunca podía
  dispararse porque Angular usa el primer match. Eliminada (de paso, quedó absorbida por el rediseño de ruteo de
  esta misma ronda).
- **4 componentes huérfanos borrados** (nunca importados fuera de su propio `.spec.ts`): `carnet-qr` y
  `directorio-operadores` (`asistencia/components/`), `tabla-historial` y `revision-lote`
  (`horometros/components/`) - carpetas completas (`.ts`/`.html`/`.css`/`.spec.ts`).
- **Bloques comentados eliminados** (código muerto, no documentación): la ruta vieja de `procesar-foto` completa en
  `horometros.routees.ts` (con su import de `analizarfotoHorometro`, que ya no se usaba en ningún otro lado del
  archivo - los controladores lo importan por su cuenta), un chequeo de duplicado comentado en
  `actividades.controller.ts`, y un constructor `Sequelize(...)` viejo en `config/database.ts` superado por el
  actual.
- **Imports sin usar eliminados**: `Optional`, `Operador`, `Actividad`, `CreateAuthTokenConfig` (este último un
  resto de autocompletado, sin relación con el archivo) en `models/asistencias.ts`; `toDefaultValue` en
  `models/operador.ts`.
- **Campo de modelo sin usar eliminado**: `asistencias.diesel_consumido` - ninguna llamada en ningún controlador ni
  en el frontend lo lee o escribe. Se sacó del modelo Sequelize (la columna de la BD no se tocó, ver Tablas).
- **Script de debug suelto borrado**: `backend-horometros/src/test.model.ts` (probaba la API de Gemini a mano, no
  formaba parte de ningún flujo de la app ni de `package.json`).
- `backend-horometros/src/config/database.js` (CommonJS) **no es** código muerto pese a parecer un duplicado de
  `database.ts` - es el config que `sequelize-cli` lee para migraciones (`.sequelizerc`), se dejó intacto.

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
- Offline/sync: la app empaqueta nativo (no PWA, así que no aplica la limitación de Background Sync de iOS/Safari de
  todas formas), pero se mantiene el diseño de sync manual/periódico ya acordado para cuando no hay señal en campo.
- **Diseños de Figma confirmados, pendientes de construir** (el usuario los compartió, existen en su Figma):
  - "Descargar" (exporta a Excel, formato pendiente de que el usuario lo proporcione) e "Imprimir" general en el
    Directorio de Operadores - este último solo se habilita cuando el Historial está filtrado a **un solo día**
    (imprime todas las hojas físicas de ese día de una vez, de todos los operadores); con varios días combinados
    no se habilita, para no tener que resolver "cuántas hojas de cuántos días imprimo". El "Ver/Imprimir" **por
    operador individual** (Directorio) y **por fila individual** (Historial, un solo día) ya se construyeron, ver
    abajo.
  - ~~Nueva pestaña de ADMIN para crear/editar/eliminar Equipos y Secciones~~ - Equipo y Actividad ya se
    construyeron esta ronda como pestañas del Panel de Asistente (ver abajo, "Gestión de Equipo/Actividad +
    soft-delete"). Secciones sigue sin CRUD ni pantalla (fase 2, hoy no se usa - ver modelo `registro_actividad.ts`).

### Ver/Imprimir hoja de actividades (Historial de Asistencia)

`asistencia-panel.ts`, `abrirHojaActividades(grupos, opciones)` abre una **ventana flotante dentro de la misma
pantalla** (`mostrarModalHoja`, mismo patrón que "Ver Evidencia" en `visor-foto.ts`: `.modal-backdrop` +
`.modal-card`) con el mismo diseño que la hoja física "REPORTES DE LABORES DIARIOS" que el usuario compartió
como foto - **no** una pestaña/ventana nueva del navegador (`window.open`), a diferencia de `imprimirQR()`: la
app va empaquetada, así que un link separado no tiene sentido ahí, todo tiene que vivir en la misma pantalla.
Imprimir llama a `window.print()` sobre la propia página: `styles.css` (`@media print`) oculta con
`visibility: hidden` todo lo que no sea el nodo `.imprimible` (el propio `.modal-card`) y lo reposiciona a
`position: absolute` para que ocupe toda la hoja - los botones de Cerrar/Imprimir llevan `.no-imprimir` para no
salir en el papel. Esta técnica de impresión (clase `.imprimible` + `.no-imprimir` en el global `styles.css`) es
reutilizable para cualquier otro modal que a futuro necesite "imprimir solo esto".

`grupos: { operador: Operador; registros: RegistroActividad[] }[]` - un grupo por operador. Cada uno se pinta en
su propio bloque (`.hoja-actividades-grupo`) con el Mecánico en un subtítulo en negrita y letra más grande
(`.hoja-actividades-mecanico`: `Mecánico: <nombre> · <código>`), no como columna de la tabla - igual que la hoja
física, que solo repite Fecha por fila y escribe el mecánico una sola vez. Cuando hay más de un grupo (impresión
por rango, ver abajo), se separa con una línea punteada en pantalla; al imprimir el contenido fluye normal en
vez de forzar una página nueva por operador (ver "Empaquetado de páginas al imprimir" más abajo). Columnas de la
tabla: EQUIPO / OT / DAÑO / TIEMPO ESTIMADO / TALLER-CAMPO. La hoja física no tiene un campo equivalente exacto a
"daño" ni a "tiempo estimado" en el modelo actual, así que se mapean del dato más cercano disponible: DAÑO =
`RegistroActividad.observaciones` (el campo de texto libre), TIEMPO ESTIMADO = duración real calculada
(`hora_fin - hora_inicio`, o "—" si la labor sigue abierta), TALLER-CAMPO = `Actividad.categoria`. **OT** =
`RegistroActividad.area` (decisión del usuario de una ronda anterior: la columna sigue llamándose `area` en la
base de datos, pero "área" como concepto ya no se usa - lo que guarda es el número/código de Orden de Trabajo
del mecánico).

Dos puntos de entrada, mismo método interno (`abrirHojaActividades`) - **ya no existe** un botón en la Ficha del
Directorio que imprima el historial COMPLETO de un operador sin acotar fecha (el usuario lo pidió quitar: "para
imprimir la hoja tiene que tener la fecha, no imprimir todo de una sola vez" - ver más abajo qué lo reemplazó):
- **Fila del Historial** (`verHojaFilaHistorial`/`imprimirHojaFilaHistorial`): UN SOLO grupo, scoped a **ese día
  puntual** (`fecha_inicio=fecha_fin=reg.fecha`). "Ver" abre la vista previa sin imprimir, "Imprimir" además
  dispara la impresión. Al ser un solo día: la Fecha se muestra junto al nombre del operador en el encabezado en
  vez de repetirse por fila (se oculta la columna Fecha de la tabla), y se agrega un pie "Observaciones del
  Supervisor" con `Asistencia.observaciones` de esa jornada (el mismo campo que ya se edita en el Panel de
  Supervisor, `revisarAsistencia`) - "Sin observaciones." si viene vacío.
- **"🖨️ Imprimir Hojas del rango"** (`imprimirHojasRangoHistorial`, botón al final de la tabla del Historial,
  junto a la paginación): solo se habilita cuando el filtro Desde/Hasta del Historial está completo. Junta a
  **todos los operadores distintos que aparecen en la página actual de la tabla ya filtrada** (no todo el rango
  si hay más páginas - es deliberado, ver Pendiente si algún día hace falta cubrir todas las páginas) y les
  arma un grupo a cada uno con `forkJoin` (`registroActividadService.obtenerPorOperador(id, fechaInicioFiltro,
  fechaFinFiltro)`), todos en la misma ventana (ver "Empaquetado de páginas al imprimir" más abajo para cómo se
  reparten entre hojas). Como es un rango (puede haber varios días por persona), la Fecha se mantiene por fila y
  no hay pie de observaciones (no hay una sola jornada a la que asociarlas cuando son varios operadores/días a
  la vez).

Fuente de datos: `GET /api/registro-actividades/por-operador?operador_id=X&fecha_inicio=Y&fecha_fin=Z` - trae
las labores de ESE operador a través de **varias** jornadas (join a `Asistencia` por `operador_id`);
`fecha_inicio`/`fecha_fin` opcionales. Mismo control de acceso que el resto del módulo (`puedeOperarSobre`):
ADMIN/ASISTENTE/SUPERVISOR ven cualquiera, el propio Operador solo el suyo.

### Historial de Asistencia de UN operador (modal desde la Ficha)

Reemplaza al viejo botón de la Ficha. Botón "📅 Ver Historial de Asistencia" (junto a "🖨️ Imprimir Carnet", que
se queda igual - sigue siendo la única forma de generar un carnet físico nuevo, necesario para el kiosco) abre
un modal (`.historial-operador-card`, `abrirModalHistorialOperador`) con la **misma tabla que la pestaña
Historial general** (Fecha/Ingreso/Salida/Horas/Ver-Imprimir/Evidencia/Observación, reutilizando
`verHojaFilaHistorial`/`imprimirHojaFilaHistorial`/`<app-visor-foto>` tal cual), menos la columna Operador (ya
va en el título del modal) - con su propio filtro Desde/Hasta y paginación (`limite=10`), ya acotado a ese
operador. No hay backend nuevo: `AsistenciaService.obtenerHistorial()` ganó un parámetro `operadorId` opcional
que solo agrega `?operador_id=` a la query - el filtro por `operador_id` ya existía en `obtenerHistorial`
(`asistencia.controller.ts`) desde antes, no tenía UI que lo aprovechara.

Es honestamente decorativo en cuanto a "escanear" el QR - el botón abre el modal directo con el `operador_id`
que ya se tiene a mano (el operador seleccionado en la Ficha), sin cámara ni lector real. Decisión explícita del
usuario: le da una función real al carnet QR dentro del panel de la Asistente (hoy no tenía ninguna más allá de
imprimirse), sin la complejidad/riesgo de intentar que el QR físico sirva para saltarse el login (ver discusión
de por qué esa idea no encajaba con la arquitectura: el login es la puerta obligatoria de la app).

**Dos bugs reales encontrados y corregidos al construir este modal** (no specific a él, aplican a cualquier
modal futuro que reuse estos patrones):
1. `cerrarModalHistorialOperador()` no llamaba a `this.cdr.detectChanges()` - el modal "se cerraba" en el
   estado del componente pero seguía visible en pantalla hasta el próximo evento async. Mismo quirk de siempre:
   *toda* mutación de estado en un handler síncrono necesita su `detectChanges()` explícito en esta app.
2. `.modal-card` (global, `styles.css`) nunca tuvo `position: relative`, a diferencia del `.visor-foto-card`
   original del que se copió el patrón del botón "✕" (`position: absolute; top: -0.75rem; right: -0.75rem`).
   Sin un ancestro posicionado más cercano, ese botón se anclaba contra `.modal-backdrop` (que es
   `position: fixed; inset: 0`, o sea el viewport completo) en vez de la esquina de la tarjeta - quedaba
   flotando en la esquina de la PANTALLA, no de la tarjeta. Afectaba a cualquier modal que reusara ese botón
   (`.hoja-actividades-card` incluido) y se notó recién con dos modales abiertos a la vez (el de Historial +
   la hoja abierta encima), porque ahí sí se superponían/bloqueaban. Se agregó `position: relative` a
   `.modal-card` en el global `styles.css` - corrige ambos casos con un solo cambio.
   De paso, cuando dos `.modal-backdrop` conviven a la vez (la hoja se puede abrir ENCIMA del modal de
   Historial), el de más arriba en el HTML pintaba encima sin importar cuál se abrió después (mismo z-index
   para todos, 50) - se agregó una clase `.modal-backdrop-anidado` (z-index: 60) al backdrop de la hoja para
   que siempre quede arriba, que es el único caso real de anidamiento que existe hoy en este panel.

**Barra superior pegada (sticky) en vez de botón flotante, y dos bugs de impresión más** (ronda siguiente, tras
feedback visual del usuario): el botón "✕" con `position: absolute` quedaba recortado a la mitad por el propio
`overflow-y: auto` de la tarjeta apenas había contenido para hacer scroll (un elemento posicionado fuera del
padding-box de un contenedor con overflow no-visible se recorta con él). Se reemplazó por
`.hoja-actividades-barra-superior`/misma clase en `.historial-operador-card`: una barra `position: sticky;
top: -1.5rem` con margen negativo que "cancela" el padding de `.modal-card` y queda a ras de los bordes,
fondo opaco y borde inferior - Imprimir/Cerrar (o Título/Cerrar en el de Historial) quedan siempre visibles
sin importar cuánto se baje, en vez de flotar fuera de la tarjeta.

De paso, dos bugs de impresión reales, mismo origen: la **encapsulación de estilos de Angular** le agrega a
cada selector de un archivo de componente un atributo `[_ngcontent-xxx]`, lo que sube su especificidad al
nivel de un selector de dos clases del global `styles.css` (ej. `.imprimible .no-imprimir`) - y como el CSS del
componente carga después en el bundle, gana él aunque el global esté pensado para imprimir. Por eso:
1. `.hoja-actividades-card` (con `max-height: 90vh; overflow-y: auto` fuera de cualquier media query) le ganaba
   al `max-height: none` que `styles.css` ya ponía en `@media print .imprimible` - la vista previa de impresión
   mostraba el contenido con SU PROPIA barra de desplazamiento en vez de dejarlo fluir en varias páginas
   (se veía como "una captura de cada hoja").
2. `.hoja-actividades-barra-superior` (con clase `.no-imprimir`) no se ocultaba al imprimir pese a que
   `styles.css` ya la apunta con `.imprimible .no-imprimir { display: none; }`.
Ambos se resolvieron agregando el override directamente en el propio `@media print` de `asistencia-panel.css`
(`max-height: none !important; overflow: visible !important;` y `display: none !important;` respectivamente) -
mismo archivo, especificidad ya no importa porque `!important` fuerza la prioridad.

**El mecanismo de impresión global (`.imprimible`, `styles.css`) se reescribió por completo** al probar
"Imprimir Hojas del rango" con varios operadores de verdad: el contenido salía con varios "REPORTES DE LABORES
DIARIOS" superpuestos/duplicados en vez de uno por página. Dos vueltas hasta llegar al diseño final (las dos
fallaron de formas distintas y vale la pena no repetirlas):
1. **Original**: `visibility: hidden` en `body *` + `.imprimible` forzado a `position: absolute; top: 0;
   left: 0` para "escapar" del espacio que sus hermanos ocultos seguían reservando (`visibility: hidden` NO
   libera el espacio en el layout, solo lo hace invisible). Bug real: un elemento fuera de flujo (`absolute`)
   no pagina bien a varias hojas - el motor de impresión no sabe cómo partirlo entre página y página con varios
   operadores, y termina superponiendo/duplicando el contenido en vez de repartirlo.
2. **Primer intento de arreglo**: cambiar a `display: none`/`revert` (SÍ libera el espacio) para que
   `.imprimible` pudiera quedarse en flujo normal (`position: static`) y paginar bien. Bug real, distinto:
   `.imprimible, .imprimible *` solo restaura el propio nodo y sus DESCENDIENTES, nunca sus ANCESTROS - y
   `body *` ya les había puesto `display: none` a esos ancestros también (son parte de `body *`). Con un
   ancestro en `display: none`, toda esa rama deja de renderizar sin importar que el hijo diga
   `display: revert` - la página quedaba completamente en blanco.
3. **Solución final**: agregar `body *:has(.imprimible) { display: revert !important; }` - restaura también
   la cadena de ANCESTROS de `.imprimible` a cualquier profundidad de anidamiento, sin tener que listar cada
   nivel del árbol a mano (`:has()`: Chrome 105+/Firefox 121+/Safari 15.4+, cubre los navegadores donde se usa
   esta app). `.modal-backdrop` (normalmente `position: fixed; inset: 0` con fondo oscuro semitransparente)
   también se fuerza a `position: static; background: none` en print - "fixed" tampoco pagina bien a varias
   hojas, y el fondo oscuro se hubiera impreso como un rectángulo gris de pared a pared detrás del contenido.
4. **Efecto secundario de `display: revert` que hubo que corregir aparte**: `revert` restaura el display POR
   DEFECTO del navegador (div→block, table→table, etc.), lo que de paso borra cualquier `display: flex/grid`
   que un elemento necesite - `.hoja-actividades-encabezado` (Mecánico + Fecha lado a lado con
   `justify-content: space-between`) se imprimía con el texto pegado sin espacio entre los dos, por perder su
   `display: flex`. Se reafirma explícitamente en el propio `@media print` de `asistencia-panel.css` (mismo
   patrón que los otros overrides `!important` de esta sección) - cualquier otro `display: flex/grid` que se
   agregue después DENTRO de `.imprimible` en este componente va a necesitar el mismo tipo de reafirmación.

**Empaquetado de páginas al imprimir (no desperdiciar papel)**: "Imprimir Hojas del rango" imprime N operadores
en la misma ventana, cada uno en su propio `.hoja-actividades-grupo`. La primera versión forzaba
`page-break-before: always` en cada grupo salvo el primero (`.hoja-actividades-salto-pagina`) - una hoja física
por operador sin excepción, aunque el operador no tuviera labores registradas ese día (tabla de una sola fila
"Sin labores registradas"). El usuario lo pidió cambiar: quería que operadores cortos compartan hoja para no
desperdiciar papel, pero que un operador con muchas actividades (tabla alta) nunca se parta a la mitad entre una
hoja y la siguiente. Se reemplazó por `break-inside: avoid` (+ `page-break-inside: avoid`, alias viejo por si el
motor de impresión no reconoce el nombre moderno) en `.hoja-actividades-grupo`, dejando que el contenido fluya
normal entre páginas: el motor de impresión va llenando cada hoja con los grupos que alcancen completos, y si un
grupo no cabe entero en lo que queda de la página actual, lo manda entero a la siguiente en vez de cortarlo.
Verificado con Playwright: 6 operadores cortos (1 fila, "Sin labores registradas") + 1 operador con 12 filas
generaron un PDF de 2 páginas (antes hubieran sido 7, una por operador) - los cortos se agruparon varios por
hoja y el largo no se partió.

**Pendiente, fuera del control de la app**: el navegador (Chrome) agrega su propio encabezado/pie de página al
imprimir (fecha, título de la pestaña, URL, número de página) - es la casilla "Headers and footers" del propio
diálogo de impresión del navegador, NO algo que CSS/JS de la página pueda desactivar (es una protección
deliberada del navegador para que una página no pueda ocultarle al usuario qué URL está imprimiendo). Quien
imprima tiene que desmarcar esa casilla manualmente en "Más ajustes" del diálogo de impresión si no quiere que
la URL salga en el papel - no hay forma de forzarlo desde el código.

**Filtro por hacienda en el Historial**: nuevo `<select>` junto a los filtros de fecha, manda `hacienda_id` a
`GET /api/asistencia/historial`. El Operador no tiene `hacienda_id` propio (vive del Supervisor al que pertenece
de forma permanente, ver tabla de roles), así que el backend filtra vía include anidado
`operador -> supervisor -> hacienda_id` con `required: true` en el include de `operador` cuando hay filtro (si
no, Sequelize deja el include como LEFT JOIN y el `where` anidado del supervisor no filtra nada).

### Gestión de Equipo/Actividad + soft-delete (Panel de Asistente)

Dos pestañas nuevas junto a Directorio/Historial: **Equipo** (🚜) y **Actividad** (🛠️), mismo patrón de
lista+buscador+paginación+modal que ya usaba el Directorio de Operadores, con `+Nuevo`, `Editar` y `Eliminar`
por fila. Ambas comparten roles con Operador (`requireRol('ADMIN','ASISTENTE')`) - Actividad ya tenía sus 3
endpoints de mutación protegidos solo para ADMIN desde antes (sin UI), se amplió a incluir ASISTENTE ya que ahí
es donde vive esta pantalla.

**Buscador en tiempo real, sin botón "Buscar"** (`onBuscarEquiposTab`/`onBuscarActividadesTab`, debounce de
300ms con `setTimeout`+`clearTimeout` - mismo valor y patrón que ya usaba el autocompletar de Equipo/Actividad
del Panel de Actividades, ver `mi-jornada.ts`): cada tecla reinicia el temporizador y solo dispara UNA petición
al backend cuando el usuario deja de escribir, en vez de pedir que aprieten un botón o Enter. Se revisó **todo**
el resto de la app buscando el mismo problema (un buscador que solo funciona con clic/Enter): el Directorio de
Operadores y el autocompletar de Equipo/Actividad del Panel de Actividades YA eran en tiempo real desde antes (el
primero filtra en memoria sobre la lista ya cargada, sin ni siquiera necesitar debounce; el segundo ya tenía este
mismo patrón de debounce). El único filtro que se dejó con botón explícito es el del Historial (fechas +
hacienda) - no es una caja de texto que se escribe letra por letra, es un formulario compuesto (2 fechas + un
select), así que no aplica la misma solución.

**"Eliminar" es siempre soft-delete (`paranoid`), nunca borra la fila.** Se extendió el mismo patrón que ya
tenía `Actividad`/`Seccion` a `Equipo` y `Operador` (migración `20260924010000-agregar-softdelete-equipos-operadores`,
agrega `createdAt`/`updatedAt`/`deletedAt` a ambas tablas). Con `paranoid:true`, Sequelize excluye automáticamente
las filas eliminadas de cualquier `findAll`/`findAndCountAll` por defecto - así que los catálogos
(`obtenerEquipos`, `ObtenerActividades`, `obtenerOperadores`) y los selectores del Panel de Actividades quedan
filtrados gratis, sin tocarles el código. El Directorio de Operadores ganó su botón "🗑️ Eliminar Operador" en la
Ficha (antes no existía ninguna forma de dar de baja a un operador).

**Cuidado real que esto exige** (y que ya se aplicó en esta ronda): por defecto Sequelize también aplica el
filtro `paranoid` a los **includes** - así que un `Operador`/`Actividad`/`Equipo` eliminado DESPUÉS de generar
una Asistencia/RegistroActividad iba a desaparecer silenciosamente de esos registros ya existentes (nombre en
blanco en el Historial, en "Ver/Imprimir Hoja de Actividades", etc.) en cualquier include que no diga lo
contrario. Se agregó `paranoid: false` explícito a cada include de Operador/Actividad/Equipo/Seccion que sirve
para mostrar datos YA REGISTRADOS (`obtenerAsistenciaHoy`, `finalizarDia`, `obtenerHistorial` en
`asistencia.controller.ts`; `obtenerRegistrosPorAsistencia` y `obtenerRegistrosPorOperador` en
`registro_actividad.controller.ts`) - un catálogo dado de baja no debe borrar el rastro de lo que ya se hizo con
él. Los includes de validación al CREAR un registro nuevo (`Operador.findByPk`/`Actividad.findByPk`/
`Equipo.findByPk` al marcar asistencia o registrar una labor) se dejaron con el comportamiento paranoid por
defecto a propósito: un catálogo eliminado SÍ debe rechazarse para uso nuevo.

**`numero_hoja` de `Equipo` pasó a admitir NULL** (antes era `NOT NULL`, exclusivo de Horómetros - "número de
hoja física" de la libreta de lecturas): con el Panel de Asistente creando Equipos también, ya no puede seguir
siendo obligatorio, porque ese concepto no existe fuera de Horómetros. El formulario de "Nuevo Equipo" del Panel
de Asistente solo pide código y nombre.

### Ronda de mejoras: validación de horas, Observaciones, impresión por rol, filtro por Supervisor y Token

Siete pedidos puntuales del usuario tras revisar la app ya en uso, todos independientes entre sí:

**1. La hora de una labor NUEVA no puede quedar antes de la última labor ya registrada ese día**
(`registro_actividad.controller.ts`, `crearRegistroActividad`): antes de crear el registro, se trae TODA la
jornada (`RegistroActividad.findAll({ where: { asistencia_id }})`) y se calcula en memoria el máximo de
`hora_fin ?? hora_inicio` de cada una (Postgres no tiene un "max de coalesce" directo sin SQL crudo, y la
cantidad de labores por jornada es chica). Si la nueva `hora_inicio` queda antes de ese máximo, 400. No valida
solapamiento entre labores, solo que no retroceda en el tiempo - no se pidió más que eso.

**2. Columna "Observaciones" en "Labores de hoy"** (`mi-jornada.html`): el campo ya se capturaba en el
formulario (`nuevoRegistro.observaciones`) pero no se mostraba en la tabla de labores del día - se agregó la
columna (visible para MECANICO y OPERADOR por igual, el campo es común a ambos) y se ajustó el `colspan` de la
fila "Todavía no registras ninguna labor" (`esMecanico ? 6 : 7`, antes 5/6).

**3 y 4. Título e diseño de tabla al imprimir, según el rol del operador** (`asistencia-panel.html`, dentro del
`*ngFor="let grupo of hojaGrupos"`): antes el título y la tabla eran siempre los mismos para cualquier trabajador
("Reportes de Labores Diarios", columnas Equipo/OT/Daño/Tiempo estimado/Taller-Campo - pensadas para MECANICO).
Ahora `grupo.operador.rol` decide todo:
- Título: `REPORTE DE LABORES DIARIOS` (no-OPERADOR, o sea MECANICO) vs `REPORTE DE LABORES MAQUINARIAS`
  (OPERADOR). Mismo cambio en la etiqueta del encabezado: "Mecánico:" vs "Operador:".
- Tabla: son DOS `<table class="hoja-actividades-tabla">` con `*ngIf="grupo.operador.rol !== 'OPERADOR'"` /
  `*ngIf="grupo.operador.rol === 'OPERADOR'"` (nunca las dos a la vez). La de MECANICO se dejó intacta
  (Equipo/OT/Daño/Tiempo estimado/Taller-Campo). La de OPERADOR reemplaza OT/Daño/Taller-Campo (no aplican - un
  Operador no tiene Orden de Trabajo ni "daño" de taller) por **Horómetro inicio** / **Horómetro fin**
  (`reg.horometro_inicio`/`reg.horometro_final`) y **Observaciones** (`reg.observaciones`, el dato real de la
  labor, no reetiquetado como "Daño" como en la tabla de MECANICO) - mantiene Tiempo estimado igual que la otra.
  `grupo.operador.rol` ya venía disponible en los datos (el include de `Operador` en `obtenerHistorial` no
  restringe `attributes`, trae la fila completa) - no hizo falta tocar el backend para esto.

**5. El Historial ya no muestra una jornada antes de que el Supervisor la revise** (`asistencia.controller.ts`,
`obtenerHistorial`): bug real encontrado al investigar el reporte del usuario ("se actualiza en tiempo real
aunque el Supervisor no haya Cerrado Jornada"). El filtro de estados (`FINALIZADO`/`SALIDA_OLVIDADA`) ya excluía
`EN_JORNADA`/`PENDIENTE_REVISION`, pero el autoservicio "no podré marcar salida hoy" (`marcarSalidaOlvidada`,
Panel de Actividades del propio trabajador) pone `estado: 'SALIDA_OLVIDADA'` DIRECTO, sin pasar por
`finalizarDia` - y `finalizarDia` es quien normalmente exige que el Supervisor ya haya hecho su O/X
(`confirmado_por_supervisor !== null`, ver la validación al inicio de esa función) antes de dejar cerrar el día.
Resultado: un trabajador que se autocerraba aparecía en el Historial al instante, sin que nadie del lado del
Supervisor lo hubiera tocado - exactamente el hueco de fraude que el O/X existe para atrapar (alguien pasó su
código/QR a un compañero). Se agregó `whereCondition.confirmado_por_supervisor = { [Op.ne]: null }` al
`obtenerHistorial` - la misma condición que `finalizarDia` ya exige, aplicada también aquí para el caso
`SALIDA_OLVIDADA` que se autocierra sin pasar por ahí. No cambia nada para el flujo normal (todo lo que llega a
`FINALIZADO` vía `finalizarDia` ya tiene `confirmado_por_supervisor` garantizado por esa misma función).

**6. Cuenta regresiva del Token de Hacienda** (`admin-panel.ts`/`.html`/`.css`, pestaña Haciendas): el backend
YA rechazaba un Token vencido (`marcarConCodigo`/`marcarConMiCodigo` comparan `token_expira_en` contra la hora
actual desde el principio) - el hueco era 100% visual: la columna solo mostraba la fecha/hora de vencimiento en
texto plano, un token vencido se veía idéntico a uno vigente. Se agregó un intervalo de 1s (`ngOnInit`, limpiado
en `ngOnDestroy`) que fuerza a recalcular `tiempoRestanteToken(hacienda)` (formato `HH:MM:SS`, o "Expirado" en
rojo/negrita una vez que `token_expira_en - ahora <= 0`, clase `.token-vencido`). No se tocó el backend - ya
hacía lo correcto, era la UI la que nunca lo comunicaba.

**7. Filtro "Supervisor" en el Historial (para ADMIN)** (`asistencia.controller.ts`/`asistencia-panel.ts`/`.html`):
nuevo `<select>` junto al de Hacienda, mismo patrón (`supervisor_id` opcional en `GET /historial`, filtra
`operador.supervisor_id` directo vía include). Reusa `supervisores: Usuario[]` (ya cargado en el componente para
el selector de "a qué hacienda pertenece" al crear/editar un Operador) - no hizo falta un fetch nuevo. Nota:
como cada Hacienda tiene como máximo UN Supervisor (`usuarios_hacienda_id_supervisor_unico`, UNIQUE en BD), este
filtro y el de Hacienda devuelven exactamente el mismo resultado - se agregó de todas formas porque es más
directo para un ADMIN pensar "quiero ver lo que hizo tal Supervisor" que tener que saber a qué hacienda
pertenece.

## Flujo de trabajo de esta sesión

Backend: todo cambio se prueba primero contra Postgres local (`service postgresql start`, rol `postgre`/`1234`,
BD `horometros_db`) antes de darse por terminado. Migraciones nuevas van numeradas después de la última existente.

Frontend: mientras no esté empaquetado nativo, se prueba en el navegador contra el link de Vercel (o `ng serve` local
apuntando al backend real de Render) - no hace falta empaquetar para cada prueba.
