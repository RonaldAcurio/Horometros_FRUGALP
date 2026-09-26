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
- `backend-horometros/src/config/database.migrations.js` (CommonJS, antes `database.js` - renombrado
  2026-09-25, ver "Pruebas de integración") **no es** código muerto pese a parecer un duplicado de `database.ts`
  - es el config que `sequelize-cli` lee para migraciones (`.sequelizerc`).

## Deuda técnica heredada

- `finalizarDia` no filtra por `hacienda_id`: un Supervisor con permiso para cerrar jornada cierra TODAS las
  haciendas del día a la vez, no solo la suya. Ya no está bloqueado por el Login (que ya existe) - queda pendiente
  como su propio cambio, ver Pendiente.
- `SequelizeMeta` de este checkout tenía un hueco (migraciones aplicadas a mano sin registrar) - ya reconciliado
  localmente, pero verificar en cualquier entorno nuevo con `sequelize-cli db:migrate:status`.

## Checklist de seguridad/operación (auditoría, no repetir sin releer esto)

Lista de chequeo que el usuario pidió evaluar (2026-09-24) para saber si la app cumple como para pasar a
producción real. Estado resumido - el razonamiento completo de cada punto vive en la conversación donde se hizo
la auditoría, esto es solo el veredicto para no tener que rehacerla de cero cada sesión. `✅` cumple, `⚠️`
parcial/riesgo, `❌` no cumple, `➖` no aplica hoy.

**Requisitos y diseño:** requerimientos funcionales ✅ (documentados arriba) · no funcionales ⚠️ (sin metas
explícitas de tiempo de respuesta/uptime) · restricciones de integridad ✅ (FKs + UNIQUE reales en BD).

**Seguridad de la app:** manejo de sesiones ✅ (arreglado 2026-09-25, revocación real al cambiar la clave, ver
abajo) · almacenamiento seguro ✅ (arreglado 2026-09-25: bcrypt para claves + AES-256-GCM para cédula/teléfono/
dirección del Operador, ver abajo) · cifrado de datos sensibles ✅ (mismo arreglo, ver abajo - requiere
`CIFRADO_CLAVE` configurada en Render antes de desplegar) · SQL injection ✅ (Sequelize parametrizado, cero queries crudas) · XSS ✅ (Angular escapa por defecto, cero
`innerHTML`/`bypassSecurityTrust`) · CSRF ✅ (JWT va en header, no en cookie) · rate limiting ✅ (arreglado
2026-09-25, ver abajo) · helmet/cabeceras de seguridad ✅ (arreglado 2026-09-25) · CORS ✅ (arreglado 2026-09-25,
dominio de producción de Vercel ya viene por defecto, `CORS_ORIGIN` solo hace falta si agregan otro dominio) ·
certificados SSL ✅ (los da Render/Vercel automático).

**Infraestructura:** balanceador de carga ❌ (pendiente de decisión de plan - con ~950 trabajadores de campo
como usuarios reales de la app SÍ hay que resolverlo, ver Pendiente) · backups de BD ❌ (no verificado - urgente
revisar plan de Render/Railway, el free tier expira solo) · firewall ➖ (lo maneja la plataforma) · redundancia
❌ (una sola instancia) · recuperación ante desastres ❌ (sin plan) · escalabilidad horizontal/vertical ⚠️
(diseño stateless ayuda + pool de conexiones de Sequelize ya explícito desde 2026-09-25 para poder escalar
réplicas sin sorpresas, pero sin plan pago que dé las réplicas todavía) · cache ❌ · cola de procesamiento ❌
(no hace falta todavía) · tareas en segundo plano ❌ (nada corre solo, "Cerrar Jornada" es 100% manual).

**Ciclo de desarrollo:** ambientes dev/stage/prod ⚠️ (solo dev y prod, sin staging) · secretos ✅ (`.env`
gitignored, `JWT_SECRET`/`CIFRADO_CLAVE` fallan duro si faltan) · CI/CD ✅ (arreglado 2026-09-25, GitHub Actions
en cada push/PR a main, ver abajo) · pruebas unitarias ✅ (arreglado 2026-09-25: pruebas reales de lógica de
negocio - validación de horas y vigencia del Token de Hacienda, backend y frontend - además de los specs por
componente que ya traía Angular) · integración ✅ (arreglado 2026-09-25, ver abajo - contra Postgres real,
corre en CI con un servicio de BD propio) · end-to-end ✅ (arreglado 2026-09-25, ver abajo - Playwright real
contra el navegador, backend y BD reales, esta vez sí quedó en el repo y corre en CI) · carga ✅ (arreglado
2026-09-25, ver abajo - `autocannon` contra volumen real de ~950 operadores, no corre en CI a propósito, un
hallazgo real quedó pendiente de decisión de producto en "Pendiente").

**Configuración y observabilidad:** login ✅ (arreglado 2026-09-25: rate limiting ya estaba de la ronda anterior,
clave mínima subida de 6 a 8 caracteres) · monitoreo de métricas ❌ · alertas ❌ · trazabilidad ⚠️ (mejorado
2026-09-25: ahora hay auditoría técnica de acciones sensibles - reseteo de claves, Token de Hacienda - además de
la auditoría de negocio que ya existía (O/X, timestamps), ver abajo; sigue sin haber auditoría técnica de acceso
genérico, ej. "quién vio el listado de usuarios") · análisis de errores ❌ (solo `console.error`, sin
Sentry/similar) · observabilidad de caídas ❌ (existe `/api/health` pero nada lo monitorea).

**App móvil:** ➖ no aplica en su totalidad todavía - sigue siendo 100% web, sin build nativa ni presencia en
tiendas (certificados de firma, perfiles de aprovisionamiento, firmas, bill of materials de tienda, rendimiento
nativo, compatibilidad entre dispositivos, analítica de app - todo esto se activa cuando se empaquete). Dos
excepciones que sí aplican YA, como web, porque ya se maneja PII real de trabajadores en producción: política de
privacidad ✅ (arreglado 2026-09-25, borrador redactado + gate de aceptación en el login + datos legales de
FRUGALP AGRICOLA EXPORTADORA G-P CIA. LTDA. ya completados - RUC, correo de contacto, retención de 2 años) · términos y
condiciones ✅ (mismo documento/mismo arreglo) · protección de datos personales ✅ (arreglado 2026-09-25, cifrado
en reposo de cédula/teléfono/dirección, ver abajo) · actualización de dependencias ✅ (arreglado 2026-09-25, Dependabot semanal en los 2 proyectos
+ Actions) · vulnerabilidades de terceros ✅ (arreglado 2026-09-25, `npm audit` corre en CI y quedó en 0 en
ambos proyectos, ver abajo).

**Veredicto:** la base de código está sólida donde más cuesta acertar (ORM parametrizado, Angular sin XSS,
claves con bcrypt, JWT bien diseñado, integridad referencial real). Como operación de producción con cientos de
usuarios reales, no cumple: sin pruebas, sin CI/CD, sin observabilidad de ningún tipo, backups sin verificar, y
3 huecos de seguridad baratos de cerrar (CORS abierto, sin rate limiting, sin helmet) que son la prioridad
inmediata. Balanceador de carga/redundancia pasaron de "no aplica" a "sí aplica" en cuanto se confirmó la escala
real (~950 trabajadores de campo como usuarios de la app, ~150 de oficina que no la usan, de un total de ~1100).

### Cierre de los 3 huecos baratos (2026-09-25)

- **CORS**: `app.ts` ya no usa `cors()` sin argumentos. Ahora lee `process.env.CORS_ORIGIN` (lista separada por
  comas, para agregar dominios sin tocar código) y solo acepta esos orígenes; sin la variable configurada, cae al
  dominio real de producción en Vercel (`https://horometros-frugalp.vercel.app`, el "Domain" estable del
  proyecto - no las URLs de preview con hash que cambian en cada deploy) + `http://localhost:4200` para
  desarrollo, así que no hace falta configurar nada para que el frontend actual siga funcionando tal cual. Si
  agregan un dominio propio o algún otro deploy de Vercel más adelante, ahí sí hay que setear `CORS_ORIGIN` en
  las variables de entorno de Render con la lista completa (reemplaza el fallback, no se suma a él).
- **Rate limiting**: `middlewares/rate-limit.middleware.ts` (nuevo) - `limitadorLogin` (10 intentos/15min) en
  `POST /api/auth/login` y `POST /api/asistencia/marcar-codigo` (comparten el mismo balde por IP, ambos piden
  clave); `limitadorMarcacion` (30/15min, más laxo) en `POST /api/asistencia/marcar-qr` (solo pide un
  `operador_id`, no una clave). Guarda el conteo en memoria del proceso - si algún día corren 2+ réplicas del
  backend detrás de un balanceador, cada réplica cuenta aparte (el límite real efectivo se multiplica por la
  cantidad de réplicas); no hace falta resolverlo todavía, pero si se vuelve un problema real la solución es un
  store compartido (Redis) en vez del de memoria por defecto.
- **Helmet**: `app.use(helmet())` en `app.ts` - cabeceras de seguridad por defecto (CSP, X-Frame-Options,
  X-Content-Type-Options, etc.), sin configuración especial.
- **`trust proxy`**: `app.set('trust proxy', 1)` - necesario porque Render/Railway ponen la app detrás de su
  propio proxy inverso; sin esto, Express ve la IP del proxy en vez de la del cliente real y el rate limiting de
  arriba queda inútil (o directamente `express-rate-limit` v8+ tira error por no poder confiar en
  `X-Forwarded-For` sin este ajuste explícito).
- **Pool de conexiones de Sequelize** (`database.ts`): antes sin configurar (default de Sequelize, `max:5`).
  Ahora explícito (`max:10` por instancia) para que escalar horizontalmente el backend sea un número conocido
  (réplicas × 10 conexiones) en vez de una sorpresa contra el límite de conexiones del plan de Postgres
  contratado - ajustar ese `max` si el plan de BD cambia.

Verificado con curl local: `OPTIONS` con un origen no permitido no devuelve `Access-Control-Allow-Origin` (el
navegador lo bloquea solo); 10 intentos seguidos de login con clave incorrecta devuelven 401, el 11º en adelante
429; las cabeceras de Helmet aparecen en cualquier respuesta.

### CI/CD, dependencias y clave mínima (2026-09-25)

- **GitHub Actions** (`.github/workflows/ci.yml`, nuevo): corre en cada push y PR hacia `main`. Job `backend`:
  `npm ci` + `npm run typecheck` (`tsc --noEmit`). Job `frontend`: `npm ci` + `npm run typecheck` + `npm test`
  (Vitest vía el builder `@angular/build:unit-test` de Angular 22, no necesita browser/Chrome porque corre en
  jsdom, a diferencia del Karma viejo) + `npm run build`. No reemplaza el despliegue automático de
  Render/Vercel, lo complementa: si esto falla, el error queda visible en GitHub ANTES de que el push llegue a
  producción.
- **Specs rotos arreglados** (bloqueaban el `npm test` de arriba, 4 de 8 archivos fallaban con
  `NG0201: No provider found for ActivatedRoute` porque sus componentes usan `RouterLink` en la plantilla y el
  `TestBed` de cada spec no proveía ningún router): `app.spec.ts`, `dashboard.component.spec.ts`,
  `asistencia-menu.spec.ts`, `supervisor-panel.spec.ts` (este último también necesitó `provideHttpClient()`,
  sus servicios inyectados lo requieren). De paso, `app.spec.ts` tenía una aserción del boilerplate original de
  `ng new` nunca actualizada (esperaba el texto `"Hello, frontend-horometros"`, que no existe en ningún lado de
  la app real) - se corrigió para comprobar `"FRUGALP"` (el `<h1>` real de `app.html`).
- **`marcacion-kiosco.spec.ts` excluido del test target** (`angular.json`, `test.options.exclude`): el
  componente usa `ZXingScannerModule` (`@zxing/ngx-scanner`), que internamente importa `@zxing/library` - un
  paquete CommonJS cuyos "named exports" (`BarcodeFormat`, etc.) Vitest no puede resolver en el entorno de
  pruebas (`SyntaxError: Named export 'BarcodeFormat' not found`), aunque en el navegador real (`ng serve`/
  `ng build`) funciona sin problema - es una incompatibilidad de bundler de pruebas con esa librería en
  particular, no un bug de la app. Queda documentado en un comentario arriba del `describe()` del spec.
- **`qcore` eliminado** (`frontend-horometros/package.json`): dependencia directa que nunca se usó en ningún
  lado de `src/` (cero imports) - por el commit donde se agregó (junto a `@zxing/ngx-scanner`, en la integración
  de QR) todo indica que fue una instalación accidental, no algo puesto a propósito. Era, ella sola, la fuente
  de las 4 vulnerabilidades "high severity" que reportaba `npm audit` en el frontend (via su dependencia
  `chalk-animation` → `meow` → `trim-newlines`, sin fix disponible). Al sacarla, `npm audit` del frontend quedó
  en 0. En el backend, `npm audit fix` (sin `--force`) resolvió `qs`; queda una vulnerabilidad moderada
  restante en `uuid` (vía `sequelize`) cuyo único fix downgradea `sequelize` a la v3 (breaking change real) - se
  dejó como está a propósito, no se fuerza un downgrade de esa magnitud sin decisión explícita del usuario.
- **Clave mínima subida de 6 a 8 caracteres**: las 4 validaciones del backend que la exigían
  (`asistencia.controller.ts` x2, `usuario.controller.ts` x2) y los 5 lugares del frontend que la reflejaban
  (`minlength`/texto de ayuda en `admin-panel.html` y `asistencia-panel.html`) - uno de esos 5 en el frontend no
  tenía `minlength` en el `<input>`, solo el texto de ayuda, se le agregó de paso.
- **`package.json` de ambos proyectos**: se agregó `typecheck` (antes solo existía como comando suelto de
  `tsc`/`ng`) y se arregló `test` del backend, que literalmente fallaba siempre (`"echo Error: no test
  specified && exit 1"`, el default de `npm init`) - ahora corre `typecheck` (no hay pruebas reales de backend
  todavía, ver "Pendiente").
- **`.github/dependabot.yml`** (nuevo): PRs semanales de actualización de dependencias para `backend-horometros`,
  `frontend-horometros` y las propias GitHub Actions - máximo 5 PRs abiertos a la vez por ecosistema.

### Política de Privacidad/Términos de Uso + gate de aceptación en el primer login (2026-09-25)

Redactado un borrador (responsable del tratamiento, datos que recopila el Sistema, base legal LOPDP, derechos
ARCO+, seguridad, objeto del servicio, propiedad intelectual, ley aplicable) con datos entre corchetes `[ ]`
para que la empresa cliente los complete (razón social, RUC, correo de contacto) antes de ir a producción real
con un cliente puntual. El mismo texto se embebió en `TerminosModal` (frontend) para que el trabajador lo pueda
leer sin salir de la app - no es solo un documento aparte.

- **`terminos_aceptados_en`** (`DATE`, nullable) agregado a `usuarios` Y `operadores` (migración
  `20260925000000-agregar-terminos-aceptados.js`) - `null` = todavía no aceptó. Aplica a las 2 tablas porque
  ambas tienen login propio (ver "Login único" en `auth.controller.ts`).
- **Login** (`auth.controller.ts`): el `perfil` que devuelve ahora siempre incluye `terminos_aceptados: boolean`
  (para las 2 ramas, Usuario y Operador) - el frontend decide con esto solo, sin pedir nada aparte.
- **`POST /api/auth/aceptar-terminos`** (nuevo, `verificarAutenticacion` sin `requireRol` - cualquier cuenta
  logueada puede aceptar): pone `terminos_aceptados_en = NOW()` en la tabla que corresponda según
  `req.auth.tipo`. No hay endpoint para "desaceptar" - si algún día cambia el documento y hace falta pedir de
  nuevo, la forma de resetear es un `UPDATE ... SET terminos_aceptados_en = NULL` manual (no se construyó UI para
  esto, es un caso raro).
- **`TerminosModal`** (`shared/terminos-modal/`, nuevo, montado una sola vez en `app.html` fuera del
  `router-outlet` para poder bloquear cualquier pantalla) - un solo componente para 2 modos, decididos con 2
  signals computados:
  - **Bloqueante** (`modoBloqueante`): `authService.estaAutenticado() && perfil().terminos_aceptados === false`.
    Sin botón "Cerrar" - el único botón habilitado es "Aceptar y continuar", deshabilitado hasta marcar el
    checkbox. Aparece automáticamente apenas el login trae `terminos_aceptados: false`, sin importar en qué
    pantalla caiga el rol (Dashboard, `mi-jornada`, `escaner`, etc.) porque vive en `app.html`.
  - **Libre** (`TerminosService.mostrarLibre`, signal nuevo e independiente): lo abre el botón "Política de
    Privacidad" del header global (`app.html`) o del pie del login (`login.html`, visible SIN loguearse). Solo
    tiene botón "Cerrar", nunca toca `terminos_aceptados_en` - es 100% para releer, no para volver a aceptar.
  - El checkbox usa una propiedad plana (`aceptado = false`) con `[(ngModel)]`, no un signal directo - mismo
    patrón que el resto de los formularios de la app (los signals se reservan para toggles con `(click)`, como
    `mostrarClave`).
- Probado end-to-end con Playwright contra Postgres+backend locales: login con `terminos_aceptados:false` →
  modal bloqueante aparece, botón deshabilitado hasta marcar el checkbox → aceptar → recargar la página → el
  modal YA NO vuelve a aparecer (perfil persistido en `localStorage` + confirmado con un segundo login real
  que trae `terminos_aceptados:true` desde la BD) → botón del header abre el modo libre (solo "Cerrar", sin
  checkbox ni botón de aceptar).

### Pruebas unitarias reales de lógica de negocio (2026-09-25)

Hasta ahora "pruebas unitarias" solo cubría el boilerplate default de Angular (`ng generate` - "el componente se
crea sin errores"). El usuario pidió pruebas reales de la lógica de negocio de la app: validación de horas y
cálculo/vigencia del Token de Hacienda. Estrategia: extraer esa lógica a funciones puras (sin Sequelize, sin
Express, sin Angular/TestBed) para poder probarla directo, en vez de mockear media base de datos.

- **Backend, `vitest` nuevo** (no existía ningún test runner - `npm test` literalmente corría `typecheck`
  antes de esto): `vitest.config.mts` (extensión `.mts`, no `.ts`, para que Vite lo cargue como ESM sin
  necesidad de tocar `"type"` del `package.json` - si no, tira un warning de config en cada corrida),
  `include: ['src/**/*.test.ts']`. `npm test` ahora corre `vitest run` de verdad; CI (`ci.yml`, job `backend`)
  agrega el paso `npm test` después de `npm run typecheck`.
  - `utils/validar-orden-horas.ts` (+ `.test.ts`, 6 casos): `horaEsAnteriorARegistrosPrevios` y
    `calcularUltimaHoraRegistrada`, extraídas tal cual de `crearRegistroActividad`
    (`registro_actividad.controller.ts`) sin cambiar el comportamiento - ese controller ahora solo llama a la
    función. Cubre: primera labor del día (nunca rechaza), labor previa cerrada, labor previa todavía abierta
    (compara contra `hora_inicio`, no `hora_fin`), varias labores cerradas fuera de orden (compara contra la
    MÁS reciente, no la última creada), y el límite exacto (hora igual a la última = no es "anterior", se
    acepta).
  - `utils/token-hacienda.ts` (+ `.test.ts`, 7 casos): `tokenHaciendaVigente`, que reemplaza 3 copias
    inline casi idénticas de la misma comparación de fechas que vivían sueltas en `auth.controller.ts` (login)
    y `asistencia.controller.ts` (`marcarConCodigo`, `marcarConMiCodigo`). De paso corrige una inconsistencia
    microscópica que ya existía entre esas 3 copias (una comparaba con `>` estricto y las otras con `>=` en el
    instante exacto de vencimiento) - a efectos prácticos, imposible de notar (una diferencia de milisegundos),
    pero ahora las 3 quedan exactamente iguales.
- **Frontend, mismo patrón** (ya había `vitest` vía el builder de Angular 22, ver ronda de CI/CD):
  `core/utils/token-hacienda.util.ts` (+ `.spec.ts`, 8 casos) - `tokenHaciendaVencido`/`formatearTiempoRestante`,
  extraídas de `admin-panel.ts` (antes eran métodos del componente, ahora el componente solo los llama pasando
  `this.ahora`). También se aprovechó para agregarle spec a `rutas-por-rol.ts` (+ `.spec.ts`, 4 casos) - ya era
  una función pura sin pruebas, "a qué pantalla pertenece cada rol" es lógica de negocio real y no tenía
  ningún costo de extracción (ya vivía sola en su propio archivo).
- **Deliberadamente NO cubierto todavía**: los controllers/endpoints en sí (requieren mockear Sequelize +
  Express, o levantar una base de datos de prueba - más cerca de "integración" que de "unitaria") y los
  componentes Angular con lógica async/HTTP (`AdminPanel`, `SupervisorPanel`, etc. - los specs que ya traían
  siguen siendo el boilerplate, ver arriba). Buen candidato para la próxima ronda si el usuario lo pide.

### Revocación de sesiones JWT + historial de auditoría (2026-09-25)

El usuario preguntó, con razón, por qué un JWT viejo seguía funcionando después de que ADMIN/ASISTENTE resetea
la clave de alguien - hoy (JWT stateless de 8h) no había forma de invalidarlo antes de su vencimiento natural.
Junto con eso pidió una pestaña de historial: qué USUARIO de oficina resetó una clave o generó/invalidó un
Token de Hacienda.

**Revocación de sesiones** (no requiere Redis ni nada externo - un campo en la BD alcanza a esta escala):
- **`sesion_valida_desde`** (`DATE`, nullable) agregado a `usuarios` Y `operadores` (migración
  `20260925010000-agregar-sesion-valida-desde.js`). `null` = ningún JWT invalidado nunca (default de todas las
  cuentas existentes - no rompe sesiones activas al desplegar esto). Se pisa con `NOW()` cada vez que la cuenta
  cambia de clave: `resetearClaveUsuario` (`usuario.controller.ts`), `resetearClaveOperador` y `actualizarOperador`
  cuando la edición incluyó una clave nueva (`asistencia.controller.ts`).
- **`verificarAutenticacion`** (`middlewares/auth.middleware.ts`) pasó de sincrónico a asíncrono: ya no confía
  solo en la firma del JWT, también consulta `sesion_valida_desde` de la cuenta (un solo campo, `findByPk` con
  `attributes` acotado) y compara contra el `iat` del token (que `jsonwebtoken` agrega solo al firmar). Esto
  agrega una consulta a la BD en CADA request autenticado de la app entera - aceptado a propósito: es el mismo
  costo que ya paga `verificarJornadaOperadorActiva` para el tipo `operador`, y a esta escala (~1100 cuentas) un
  `findByPk` indexado no es un problema real.
- **`utils/sesion-revocada.ts`** (+ `.test.ts`, 6 casos): `sesionFueInvalidada`, la comparación extraída como
  función pura, mismo patrón que `token-hacienda.ts`. **Bug real encontrado probando a mano** (no en el código
  final, se corrigió antes de entregar): la primera versión comparaba milisegundos (`sesion_valida_desde`)
  contra segundos×1000 (`iat`) - un login hecho en el MISMO segundo que el reseteo (caso real: alguien resetea
  su propia clave y se loguea de nuevo al toque) quedaba marcado como "sesión vieja" por error, porque `iat`
  solo tiene resolución de 1 segundo. Fix: ambos lados se truncan a segundos antes de comparar. Contrapartida
  aceptada: un JWT viejo emitido en el MISMO segundo que el reseteo (antes, por milisegundos) sigue colándose
  hasta que expira solo - un margen de 1 segundo, no de 8 horas.
- Probado con curl de punta a punta contra Postgres+backend locales: token de antes del reseteo → 401 "Tu
  sesión fue invalidada..." · login inmediato después del reseteo (mismo segundo) → 200, funciona normal.

**Historial de auditoría** (tabla `registros_auditoria`, migración `20260925020000-crear-tabla-registros-auditoria.js`,
modelo `RegistroAuditoria`, helper `utils/registrar-auditoria.ts`):
- Append-only, nunca se edita ni se borra una fila. `objetivo_nombre` queda "congelado" en el momento de la
  acción (no es un JOIN en vivo) para que el historial siga teniendo sentido aunque después renombren/eliminen
  al operador/usuario/hacienda; `actor` SÍ es JOIN en vivo contra `usuarios` (el nombre de quien ejecuta la
  acción prácticamente nunca cambia, y evita una consulta extra en el camino de escritura).
- Se registra desde 5 puntos: `resetearClaveUsuario`, `resetearClaveOperador`, `actualizarOperador` (solo si
  cambió la clave), `generarTokenHacienda`, `invalidarToken`. Un fallo al escribir la auditoría NUNCA tumba la
  acción principal que ya se ejecutó (`registrarAuditoria` atrapa su propio error y solo lo deja en el log del
  servidor) - resetear una clave no debe fallar porque el historial tuvo un problema.
- **`GET /api/auditoria`** (nuevo, `auditoria.controller.ts`/`.rutes.ts`), exclusivo ADMIN - es la única cuenta
  con visibilidad sobre lo que hacen tanto ADMIN como ASISTENTE, que es el punto de tener esto. **Paginado**
  (agregado 2026-09-25, mismo patrón que `obtenerHistorial`/`obtenerAsistenciaHoy` en `asistencia.controller.ts`:
  `?pagina=N`, respuesta `{ data, total, pagina, totalPaginas }`) - a diferencia del Historial de Asistencia, el
  límite va FIJO en 20 por página (`LIMITE_POR_PAGINA`, no se deja elegir por query) porque esta pestaña no
  tiene ningún filtro que justifique páginas más grandes.
- Frontend: pestaña nueva **"Historial"** en el Menú Admin (`admin-panel.ts`/`.html`), visible solo con
  `*ngIf="esAdmin"` (mismo patrón que la pestaña Haciendas). Se carga recién al entrar a la pestaña, no en
  `ngOnInit` - es la que menos tráfico tiene. Tabla simple: fecha, quién (nombre + cargo), acción (etiqueta
  legible vía `ETIQUETAS_ACCION`), sobre quién/qué. Barra de paginación abajo (`.pagination-bar`, mismo
  componente visual que ya usa el Historial de Asistencia) con "Página X de Y (N registros)" + botones ◀ ▶.
- Probado con Playwright contra el backend local: ADMIN resetea la clave de una cuenta de prueba 25 veces
  (para forzar 2 páginas) - página 1 muestra 20 filas con "◀" deshabilitado y "▶" habilitado, página 2 muestra
  las 5 restantes con "▶" deshabilitado.

### Cifrado en reposo de PII del Operador (2026-09-25)

Cédula, teléfono y dirección de los Mecánicos/Operadores (~950 trabajadores) se guardaban en texto plano en la
BD - el ítem que quedaba pendiente de la auditoría de seguridad original. Ahora se cifran a nivel de columna con
AES-256-GCM (`utils/cifrado.ts`), transparente para el resto del código: el backend sigue leyendo/escribiendo
texto plano en `req.body`/las respuestas JSON, solo lo que queda guardado en Postgres cambia.

- **`CIFRADO_CLAVE`** (nueva variable de entorno OBLIGATORIA, 32 bytes en hex = 64 caracteres, generar con
  `openssl rand -hex 32`) - mismo patrón que `JWT_SECRET`: si falta, el proceso no arranca en vez de correr sin
  cifrado real. **Si esta clave se pierde, los datos cifrados quedan irrecuperables para siempre** - no hay
  forma de "resetearla" sin perder todo lo que ya está cifrado con la anterior. Falta configurarla en Render
  (además de en el `.env` local de quien desarrolle) antes de desplegar este cambio.
- **`utils/cifrado.ts`** (+ `.test.ts`, 9 casos): `cifrar()` (AES-256-GCM, IV aleatorio - para `telefono`/
  `direccion`, que nunca se buscan por igualdad) · `cifrarDeterministico()` (mismo texto de entrada → siempre el
  mismo resultado, IV derivado del propio texto vía HMAC-SHA256 - SOLO para `cedula`, que tiene `UNIQUE` en la
  BD y se busca por igualdad exacta) · `descifrar()` (sirve para los dos formatos, y devuelve tal cual un valor
  legado sin el prefijo `enc1:` - o sea, texto plano de antes de activar el cifrado).
- **`models/operador.ts`**: `cedula`/`telefono`/`direccion` ahora tienen `get()`/`set()` que cifran/descifran
  automáticamente - `instance.cedula = 'x'`, `Operador.create({cedula:'x'})` y `Operador.update({cedula:'x'})`
  pasan TODOS por el `set()` (Sequelize los intercepta), así que no hizo falta tocar `crearOperador`/
  `actualizarOperador`. Columnas ensanchadas (`STRING(100)`/`STRING(100)`/`STRING(500)`, antes `20`/`20`/`255`)
  porque el texto cifrado (base64 de iv+authTag+ciphertext, más el prefijo) es más largo que el original.
- **Excepción real encontrada y corregida**: `verificarDuplicadosOperador` (`asistencia.controller.ts`) arma su
  propio `where: { cedula: ... }` para chequear duplicados ANTES del insert/update - un `where` de Sequelize NO
  pasa por el `set()` del modelo (eso solo aplica a asignaciones de instancia), así que sin arreglar esto la
  búsqueda habría comparado texto plano contra cifrado y NUNCA habría encontrado coincidencias, dejando pasar
  cédulas duplicadas en silencio. Se cifra el valor buscado a mano, con `cifrarDeterministico()`, antes de armar
  el `where`. De paso, `mensajeDuplicadoGenerico` (el mensaje de respaldo ante una condición de carrera) dejó de
  mostrar el valor crudo del error de Postgres para el campo `cedula` - ese valor ahora sería el texto CIFRADO,
  no la cédula real, y mostrarlo confundiría en vez de ayudar.
- **Migración `20260925030000-cifrar-pii-operadores.js`**: ensancha las 3 columnas y cifra (backfill) todo lo
  que ya estaba en texto plano - reimplementa el mismo algoritmo en JS plano porque las migraciones corren
  fuera de `tsx`/`ts-node`, sin acceso directo a los módulos TS del proyecto (si el algoritmo de `cifrado.ts`
  cambia alguna vez, hay que replicar el cambio ahí también). Idempotente (un valor que ya empieza con `enc1:`
  se salta - se puede interrumpir y correr de nuevo sin duplicar el cifrado ni perder datos) y sin `down()` real
  (revertir cifrado ya aplicado en producción es una decisión manual, no un rollback de rutina).
  **⚠️ Antes de correrla en producción: hacer un respaldo manual de la base de datos.** Reescribe PII real de
  ~950 trabajadores - la migración en sí es segura e idempotente, pero un respaldo previo sigue siendo la única
  forma real de deshacer un problema (ej. `CIFRADO_CLAVE` mal configurada).
- Probado de punta a punta contra Postgres local: cédulas/teléfonos/direcciones que ya estaban en texto plano
  (de sesiones de prueba anteriores) quedaron cifradas tras migrar (`SELECT` directo en `psql` confirma
  `enc1:...`) · crear un Operador nuevo con esos 3 campos → la API devuelve texto plano, la BD guarda cifrado ·
  crear otro Operador con la MISMA cédula → rechazado 409 con el nombre correcto (no el texto cifrado) · esa
  misma verificación de duplicado TAMBIÉN funciona contra una cédula que fue migrada desde texto plano
  (confirma que el cifrado determinístico de la migración y el del modelo producen el mismo resultado) · editar
  teléfono/dirección de un Operador existente → responde en texto plano correctamente · listar operadores con
  cédula/teléfono `null`/`''` (datos preexistentes) no revienta.
- **No cubierto por este cambio** (fuera del alcance que se pidió - "cédula, teléfono y dirección"):
  `nombre_completo` (se usa para ordenar/mostrar en toda la app; cifrarlo rompería esas listas) y `codigo_megued`
  (código operativo interno, no dato personal en el sentido de la Política de Privacidad).

### Pruebas de integración + 3 bugs reales de infraestructura encontrados al construirlas (2026-09-25)

El usuario pidió seguir con lo que faltaba de la auditoría original. Se armaron pruebas de integración reales
(HTTP de punta a punta contra Postgres real, con `supertest`, no mocks) para los 3 flujos más recientes y más
complejos de la app: login + revocación de sesión, cifrado de PII del Operador, e historial de auditoría
paginado. Construirlas destapó 3 problemas reales de infraestructura que nunca se habían notado porque nadie
había intentado migrar una base de datos REALMENTE vacía hasta ahora - los tres ya están corregidos.

**Infraestructura de pruebas:**
- BD de test **separada** de development (`DB_NAME_TEST`, por defecto `<DB_NAME>_test` - no hace falta
  configurar nada nuevo) - `config/database.ts` y `config/database.migrations.js` la usan cuando
  `NODE_ENV=test`. Sin esto, correr las pruebas de integración locales habría truncado/insertado contra la
  misma BD que se usa para probar a mano. Hay que crearla una vez a mano (`createdb horometros_db_test`) antes
  de correr `npm run test:integration` local - en CI la crea sola el servicio de Postgres.
- `vitest.integration.config.mts` (separado de `vitest.config.mts`, los unitarios) - filtra `*.itest.ts` (no
  `*.integration.test.ts`, para no chocar con el glob `*.test.ts` de los unitarios), `globalSetup` corre las
  migraciones reales contra la BD de test antes de la primera prueba, `fileParallelism:false` (las pruebas
  comparten una sola BD real, en paralelo se pisarían entre sí).
- `src/test-setup/helpers.ts`: `limpiarBaseDeDatosTest()` (trunca en el orden correcto por las FK) y
  `crearUsuarioDePrueba()` (crea un Usuario directo por Sequelize, no por HTTP - no existe un endpoint público
  para crear el primer Admin, mismo motivo que "Cuenta ADMIN de arranque").
- `npm run test:integration` (nuevo script) - job nuevo en CI (`backend-integration`), **separado** del job
  `backend` de siempre (que sigue sin BD, rápido) - con un servicio `postgres:16` real, migra y corre las
  pruebas. Claves de prueba fijas y sin ningún valor real en el YAML (no son secretos de GitHub a propósito).
- **3 archivos de pruebas** (`src/integration-tests/`): `auth.itest.ts` (login incorrecto, login exitoso,
  y sobre todo la regresión completa de la revocación de sesión: token viejo se bloquea, login nuevo funciona)
  · `operador.itest.ts` (la API devuelve PII en texto plano, la BD la guarda cifrada de verdad - `SELECT`
  directo -, cédula duplicada rechazada sin exponer el texto cifrado, editar responde en texto plano) ·
  `auditoria.itest.ts` (solo ADMIN puede verla, se registra un reseteo de clave, pagina con 25 registros).

**Bug 1 - `config/database.js` renombrado a `config/database.migrations.js`.** Con dos archivos llamados igual
(`database.js` para sequelize-cli, `database.ts` para la app), `import {sequelize} from "../config/database"`
(sin extensión, usado en TODA la app) resolvía distinto según la herramienta: `tsx`/`ts-node` elegían el `.ts`
correcto, pero Vite/Vitest elegían el `.js` de sequelize-cli por error - los modelos se inicializaban con
`sequelize` `undefined` ("No Sequelize instance passed"), algo que nunca se notó porque nada había usado
Vitest para importar el árbol de la app hasta estas pruebas. Sacarle la ambigüedad al nombre lo resuelve de
raíz, sin tocar ningún `import` del resto del código - `.sequelizerc` es el único lugar que sabía el nombre
real del archivo de config.

**Bug 2 - las migraciones no podían reconstruir el esquema desde una base vacía.** `operadores`, `equipos` y
`actividades` se crearon en producción ANTES de que existiera el sistema de migraciones (via un `sequelize.sync()`
antiguo - el comentario de `20260916030830-reparar-primary-key-equipos.js` ya lo documentaba para `equipos`
puntualmente). La primera migración tracked (`20260903054054`) las ALTERA asumiendo que ya existen - migrar una
BD realmente vacía (la de CI, o una recuperación de desastre desde cero) fallaba ahí mismo. Esto era invisible
hasta ahora porque nadie había migrado nunca desde cero: development/producción arrastran esas tablas desde
antes de que hubiera migraciones. Nueva migración `20260101000000-esquema-base-legado-operadores-equipos-
actividades.js` (fechada para correr PRIMERO) las crea con exactamente las columnas que ninguna migración
tracked agrega después - todo lo demás lo siguen agregando las migraciones que ya existían, sin tocarlas.
**Cada `createTable` chequea primero si la tabla ya existe y se salta si es así** (en vez de reventar) - crítico
porque en una base real (donde las 3 tablas YA existen) esta migración de todos modos aparece como "pendiente"
en el próximo `db:migrate` (por estar fechada antes que las que ya corrieron ahí); sin ese chequeo, ese
`db:migrate` se habría cortado a la mitad con un error real. Verificado en los dos sentidos: contra la BD de
desarrollo real (queda como no-op, ninguna columna se toca) y contra una BD vacía nueva (crea las 3 tablas y
el resto de la cadena de migraciones corre normal encima).
**De paso**, `20260916030830-reparar-primary-key-equipos.js` ganó un `.catch(() => {})` (mismo patrón ya usado
en otras migraciones de esta ronda): en una BD nueva creada por la migración genesis, `equipos` ya nace con una
primary key real, así que no hay nada que reparar ahí.

**Bug 3 - índice UNIQUE duplicado en `cedula` (bug propio, introducido en la ronda de cifrado).**
`20260925030000-cifrar-pii-operadores.js` le pasaba `unique:true` a un `changeColumn` sobre una columna que YA
era única (por la migración original que la agregó) - Sequelize no reconoce el constraint existente y crea uno
SEGUNDO, redundante (`operadores_cedula_key1`, visible en la BD local de pruebas). Corregido: el `changeColumn`
ya no repite `unique:true`, solo ensancha el tipo - un `ALTER COLUMN TYPE` no toca constraints existentes.
Verificado con una migración desde cero: un solo índice UNIQUE en `cedula`, como corresponde.

### Pruebas end-to-end reales (Playwright, 2026-09-25)

Las últimas rondas de Playwright fueron siempre manuales (yo probando a mano antes de entregar un patch) y
nunca quedaron en el repo. Esta vez sí: `@playwright/test` corre contra el navegador de verdad, el backend real
(`tsx watch`) y la BD de test real (la misma infraestructura que ya armaron las pruebas de integración) - no es
otro nivel de mocks, es la UI completa haciendo clics reales.

- **`frontend-horometros/playwright.config.ts`**: `testDir: './e2e'` (fuera de `src/`, para no chocar con el
  glob `src/**/*.spec.ts` de `ng test`/Vitest). `webServer` (un array: Playwright levanta y apaga los DOS
  servidores solo, antes/después de toda la corrida) - backend vía `npm run e2e:server` (nuevo script del
  backend: migra la BD de test + siembra una cuenta ADMIN fija + levanta el server, los tres con
  `NODE_ENV=test`) y frontend vía `ng serve --configuration=e2e`. `fullyParallel:false`/`workers:1`: todos los
  specs comparten el mismo backend y la misma BD real, en paralelo se pisarían entre sí.
- **`environment.e2e.ts`** (nuevo, + configuración `e2e` en `angular.json` para `build`/`serve`): apunta a
  `http://localhost:3000/api` (el backend de test) - separado de `environment.development.ts` a propósito, que
  sigue apuntando a Render como siempre (nunca se toca para esto).
- **`backend-horometros/src/test-setup/sembrar-e2e.ts`** (nuevo): limpia la BD de test y crea una cuenta
  `e2e_admin` fija con `terminos_aceptados_en` ya seteado (para no interferir con specs que no son sobre ese
  gate) - a diferencia de las pruebas de integración (que limpian entre cada test), e2e parte de un estado
  inicial fijo una sola vez, porque navegar la UI real es mucho más lento.
- **2 specs** (`frontend-horometros/e2e/`): `login.spec.ts` (clave incorrecta muestra error, login correcto
  lleva al Dashboard, y el flujo completo del gate de Términos: `e2e_admin` crea una cuenta nueva vía la UI
  real del Menú Admin, esa cuenta ve el modal bloqueante en su primer login, lo acepta, y no lo vuelve a ver
  después de un refresh) · `admin-historial.spec.ts` (crear un usuario, resetear su clave, y confirmar que la
  pestaña Historial muestra la fila correcta - quién, qué acción, sobre quién).
- **Bug real encontrado en mis propios specs** (no en la app): el helper que confirma "el usuario ya aparece en
  la tabla" buscaba por texto plano (`text=usuario123`) - el toast de éxito ("Usuario 'X' creado
  correctamente") también contiene ese mismo texto, así que el locator matcheaba 2 elementos y Playwright lo
  rechaza en "strict mode". Corregido apuntando a `.code-badge` (la celda real de la tabla), no a un texto
  suelto.
- CI: job nuevo `e2e` (`.github/workflows/ci.yml`), con su propio servicio de Postgres (mismo patrón que
  `backend-integration`) - hace `npm ci` en las dos carpetas, `npx playwright install --with-deps chromium`, y
  corre `npm run test:e2e` desde `frontend-horometros` (que levanta los dos servidores solo). Si algo falla,
  sube el reporte de Playwright como artefacto para poder revisarlo sin tener que reproducirlo a mano.
- Corrido 2 veces seguidas en local para confirmar que es repetible (usuarios de prueba con nombres únicos por
  timestamp, no fijos) - 4/4 en ambas corridas.

### Pruebas de carga (autocannon, 2026-09-25)

Primera vez que se mide, con números reales, cómo responde el backend al volumen que va a tener la empresa
cliente (~950 trabajadores de campo). No corren en CI a propósito (son pesadas/lentas y miden capacidad, no
corrección) - se corren a mano antes de un release grande, contra la BD de test real.

- **`backend-horometros/src/test-setup/sembrar-carga.ts`** (nuevo, `npm run carga:preparar`): siembra 950
  Operadores con su Asistencia de hoy YA cerrada (para medir lectura del Panel/Historial con volumen real), 950
  Operadores APARTE sin marcar hoy (para la ráfaga de escritura - un Operador solo puede marcar una vez al día,
  reusar el mismo pool para las dos cosas habría hecho que la ráfaga fallara por regla de negocio, no por
  capacidad) y 3000 registros de auditoría repartidos en 180 días.
- **`backend-horometros/src/test-setup/prueba-carga.ts`** (nuevo, `npm run test:carga`): levanta el backend real
  en el mismo proceso, mide 3 endpoints de lectura con `autocannon` (20 conexiones concurrentes ~ oficina real) y
  una ráfaga de escritura propia (`fetch` con concurrencia manual, no autocannon - necesitaba un body de login
  DISTINTO por petición, uno por trabajador) simulando 950 marcaciones de entrada distintas al arranque del
  turno, 50 a la vez.
- **`limitadorLogin`/`limitadorMarcacion`** (`rate-limit.middleware.ts`): `skip` nuevo cuando
  `NODE_ENV==='test'` - la ráfaga manda cientos de marcaciones desde una sola IP a propósito (simula 950
  trabajadores, no 1); en producción real cada uno pega desde su propio celular, así que el límite por IP nunca
  los junta. `NODE_ENV` solo vale `'test'` en pruebas corridas a mano o en CI, nunca en producción.

**Resultados de la corrida local** (máquina de desarrollo, no el plan real de Render - sirven para comparar
entre sí y para encontrar problemas de diseño, no como SLA absoluto de producción):

| Endpoint | Escenario | p50 | p97.5 | p99 | Resultado |
|---|---|---|---|---|---|
| `GET /asistencia/operadores` | 1900 operadores, **sin paginar**, 20 conc. | 1433ms | 2874ms | 3237ms | ⚠️ lento |
| `GET /auditoria?pagina=1` | 3000 registros, paginado, 20 conc. | 38ms | 61ms | 76ms | ✅ |
| `GET /asistencia/hoy?pagina=1` | 950 asistencias hoy, paginado, 20 conc. | 109ms | 137ms | 161ms | ✅ |
| `POST /asistencia/marcar-codigo` | 950 marcaciones distintas, 50 conc. | 3886ms | 6308ms | 9629ms | ✅ (0 errores, ver nota) |

**Hallazgo resuelto (2026-09-25):** `GET /asistencia/operadores` era el único de los 4 sin paginación - traía
los 950+ Operadores de un solo golpe en cada carga del Directorio de Operadores (Panel de Asistente), y por eso
salía el más lento por lejos. Arreglado con el mismo patrón que `ObtenerActividades` (`actividades.controller.ts`):
sin `pagina`/`limite` en la query sigue devolviendo el arreglo completo (compatibilidad hacia atrás, nadie más
lo llamaba así pero se deja por si acaso), con `pagina`/`limite` responde paginado, y con `q` opcional filtra
por `nombre_completo`/`codigo_megued` (`LIKE`) y por `cedula` (IGUALDAD EXACTA, no `LIKE` - la cédula está
cifrada en la BD con cifrado determinístico, que preserva igualdad pero no permite buscar por un fragmento del
texto plano; ver `models/operador.ts`). El frontend (`asistencia-panel.ts`) pasó de filtrar/paginar en el
navegador sobre el arreglo completo a pedirle la página+búsqueda al backend, con debounce de 300ms en la
cajita de búsqueda - mismo patrón ya usado en las pestañas Equipo/Actividad de este mismo componente.
Probado con `curl` contra Postgres local: búsqueda parcial por nombre (2/2 coincidencias), por código
(1/1), cédula exacta (1/1) y cédula parcial (0/0, la limitación documentada arriba, funciona como se espera).
No se pudo probar en navegador real esta ronda - la versión de Node del entorno de esta sesión quedó por debajo
del mínimo que exige Angular CLI 22 (bloquea `ng serve`/`ng build`/`ng test` por igual), así que la parte de
Angular solo se verificó con `tsc --noEmit` + revisión manual del diff completo (no detecta errores de binding
en el template, a diferencia de una build real - conviene una prueba visual rápida en el navegador tras aplicar
este patch, antes de darlo por 100% verificado).

**Nota sobre la ráfaga de `marcar-codigo`:** los 950/950 salieron exitosos, pero la latencia crece harto bajo
50 conexiones a la vez (hasta 9.6s en el peor caso, ~74s en total). La causa no es el pool de Postgres (`max:10`,
ver `database.ts`) ni una query lenta - es `bcrypt.compare` en cada login: es CPU-bound y deliberadamente lento
(así está diseñado, para resistir fuerza bruta), así que 50 requests a la vez compitiendo por el mismo hilo de
Node se van encolando. En producción real esto no es un problema: 950 trabajadores no marcan en el mismo
segundo literal, llegan repartidos en 15-30 minutos al inicio del turno - pero si alguna vez se ve lento en la
práctica, esta es la causa conocida, no un misterio a investigar de cero.

### Empaquetado con Capacitor (2026-09-26)

Plan acordado: **Android** se distribuye como `.apk` instalable directo (sin Play Store, sin costo) - **iPhone**
se queda como web normal (Safari), sin app nativa, para evitar el Apple Developer Enterprise Program ($299/año,
necesario para distribuir sin pasar por el App Store a los empleados de una empresa). Decisión de negocio del
usuario, no técnica - ver "Pendiente" para lo que falta confirmar.

- **`frontend-horometros/capacitor.config.ts`** (nuevo): `appId: 'com.frugalp.horometros'` (placeholder
  razonable, cambiarlo despues de publicado no es trivial - reinstala como app distinta, no actualiza la
  existente), `appName: 'FRUGALP'`, `webDir: 'dist/frontend-horometros/browser'`.
- **`frontend-horometros/android/`** (nuevo, generado por `npx cap add android`): proyecto nativo completo
  (Gradle, `AndroidManifest.xml`, `MainActivity.java`). Iconos/splash son los genéricos de Capacitor todavía -
  falta correr `@capacitor/assets` con el logo real de la empresa antes de distribuir de verdad (ver Pendiente).
- **CORS: `https://localhost` agregado al default de `app.ts`** - la app empaquetada de Android sirve su
  contenido desde ese origen fijo (el WebView de Capacitor), no desde el dominio de Vercel. Si `CORS_ORIGIN` SI
  esta configurada en Render (como ahora), hay que agregar `https://localhost` a esa lista a mano tambien - el
  default del código no aplica cuando la variable de entorno está seteada.
- **No se pudo compilar el `.apk` en este sandbox**: Java 21 y Gradle sí están disponibles, pero
  `dl.google.com` (repositorio Maven de Android, de donde Gradle baja el Android Gradle Plugin) está bloqueado
  por la política de red del entorno - confirmado con el error exacto de Gradle (403 Forbidden). Compilar el
  `.apk` real necesita Android Studio en una máquina con internet normal (abre la carpeta `android/`, Android
  Studio maneja el SDK solo) - o ampliar el acceso de red de este entorno (agregar `dl.google.com`) para
  terminarlo aquí mismo.
- **PWA-lite gratis para iPhone** (`manifest.json`, `apple-touch-icon.png`, meta tags en `index.html`): permite
  "Agregar a pantalla de inicio" en Safari - ícono propio, abre a pantalla completa, sin ninguna cuenta ni
  costo. No es una app nativa de verdad, pero cubre el caso de iPhone sin pagar el Enterprise Program.
- **Auditoría con Lighthouse** (local, contra el build de producción): antes de tocar nada - Rendimiento 76,
  Accesibilidad 94, Buenas prácticas 100, SEO 90. Dos hallazgos reales corregidos: contraste insuficiente del
  link "Política de Privacidad" en el login (`text-gray-400` sobre blanco, 2.53:1 - `text-gray-600`, ahora pasa
  WCAG AA) y faltaba `<meta name="description">`. Después de los arreglos: Accesibilidad 100, SEO 100,
  Rendimiento 80, Buenas prácticas 100.

### Logo real de FRUGALP en todos los íconos (2026-09-26)

El usuario pasó el logo real de la empresa (imagen PNG con fondo ya transparente, "piña/corona + sol +
franjas verdes" + el texto "FRUGALP Agrícola Exportadora" al lado). Se recortó solo el ícono (sin el texto,
sin el que no cabe/no se lee en un ícono chico), se limpió y se generaron TODOS los tamaños que hoy usa el
proyecto - reemplaza los placeholders genéricos (mi "F" verde de patch 0046, y el "X" azul default de
Capacitor) en un solo lugar:

- `public/logo-source.png`: el recorte limpio a 1024x1024 con margen, transparente - fuente de verdad para
  regenerar cualquier ícono futuro (no hace falta volver a pedirle la imagen original al usuario).
- `public/favicon.ico`, `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`: ícono de
  pestaña del navegador + PWA-lite de iPhone (ver arriba).
- `android/app/src/main/res/mipmap-*/ic_launcher*.png` (las 5 densidades): ícono de la app instalada en
  Android. Generados a mano con `sharp` con el logo sobre fondo blanco (`ic_launcher`/`ic_launcher_round`) y
  una copia transparente más chica, dentro de la "safe zone" (~62% del lienzo) para `ic_launcher_foreground`
  (ícono adaptativo, evita que el logo se recorte con la máscara circular/squircle del launcher).
- `android/app/src/main/res/drawable*/splash.png` (las 11 variantes de densidad/orientación): pantalla de
  carga de la app, logo centrado sobre blanco.

**Por qué a mano con `sharp` y no con `@capacitor/assets`** (la herramienta "oficial" para esto): al
instalarla trajo una vulnerabilidad CRÍTICA real (`tar`, path traversal via hardlinks, sin arreglo en esa
rama de versión, ver GHSA-34x7-hfp2-rc4v y relacionadas) en una dependencia anidada de su copia interna de
`@capacitor/cli`. Se desinstaló de inmediato - los tamaños de ícono de Android son un estándar público
conocido (48/72/96/144/192px por densidad), así que se generaron directo con `sharp` (que ya estaba en uso
para los íconos del navegador) sin necesidad de esa herramienta ni su cadena de dependencias.

## Pendiente

**Empaquetado con Capacitor (ver arriba) - pasos que faltan**
- Compilar el `.apk` real: necesita Android Studio (máquina del usuario) o ampliar el acceso de red de este
  entorno a `dl.google.com`.
- ~~Reemplazar los íconos/splash genéricos de Capacitor por el logo real de la empresa~~ - hecho 2026-09-26 (ver
  "Logo real de FRUGALP" abajo), pero con un logo fuente de baja resolución (~109x116px) - si la empresa tiene
  el logo en alta resolución o vectorial (AI/SVG/EPS/PDF), vale la pena regenerar los íconos desde ahí antes de
  distribuir de verdad, se van a ver mejor sobre todo en las pantallas de splash grandes.
- Probar en un iPhone real y 2-3 marcas de Android distintas antes de distribuir a los 950 trabajadores
  (cámara/QR son el punto de riesgo real entre fabricantes, ver auditoría de dispositivos).
- Offline-first (guardar marcación localmente sin señal, sincronizar después) - sigue sin implementar, ver
  conversación del 2026-09-25/26 para el diseño acordado (manual/periódico, no background sync automático, por
  la limitación real de iOS).
- Pendiente de confirmación del usuario: ¿de verdad hay iPhones entre los 950 trabajadores? Si es casi todo
  Android, no hace falta ni pensar en el costo de Apple.

**Migración/transferencia de cuentas a la empresa cliente (recordatorio, no urgente todavía)**
- Antes de entregar/vender el sistema, todas las cuentas de infraestructura (Render, Vercel, dominio, BD,
  Sentry/uptime cuando existan) deben quedar a nombre de la empresa cliente, no del desarrollador - por
  responsabilidad sobre los datos de los ~950 trabajadores (PII) y para que el soporte a futuro no dependa de
  una cuenta personal. Revisar esto después de cerrar el resto de la checklist, antes de la entrega final.

**Bug resuelto (causa raíz confirmada) - "Failed to fetch" en producción por CORS (2026-09-25)**
- Causa raíz CONFIRMADA (consola del navegador, no solo sospecha): `Access to fetch at
  'https://horometros-frugalp.onrender.com/api/auth/login' from origin
  'https://horometros-frugalp-pmn1p4vdo-ronald-acurio-s-projects.vercel.app' has been blocked by CORS policy:
  ... No 'Access-Control-Allow-Origin' header is present`. `CORS_ORIGIN` nunca estuvo seteada en Render, así que
  `app.ts` cae al default hardcodeado (`https://horometros-frugalp.vercel.app` + `localhost:4200`) - la URL real
  de Vercel del usuario (con sufijo de hash/proyecto) no matchea ninguno de los dos, el backend no la autoriza,
  el navegador bloquea la respuesta. Nada del código estaba mal, era una variable de entorno sin configurar.
- Descartado en el camino: spin-down del free tier de Render (esperado, no es esto - reintentar tras 50s seguía
  fallando), `CIFRADO_CLAVE` faltante (confirmada seteada y con formato correcto).
- **Arreglo:** agregar `CORS_ORIGIN` en Render → Environment con el dominio real de Vercel del usuario. Pendiente
  de que el usuario lo aplique y confirme - no requiere ningún cambio de código ni patch, es 100% configuración.

**Backend**
- Filtrar `finalizarDia` por `hacienda_id` del Supervisor que ejecuta el cierre (ver Deuda técnica heredada) - es un
  hueco de alcance/autorización distinto al de `verificarAutenticacion`/`requireRol` (ya cerrado, ver Endpoints):
  ahí el Supervisor SÍ tiene permiso para la acción, solo que la acción no respeta el límite de "su" hacienda.
- Paginar `GET /asistencia/operadores` (hallazgo de la prueba de carga, ver arriba) - hoy es el único endpoint de
  listado sin paginar, y es medible más lento que el resto a volumen real (~950+ Operadores). Necesita decisión
  de producto antes de tocarlo: el Menú Admin de hoy probablemente busca/filtra sobre la lista completa ya
  cargada en el cliente, así que paginar en servidor sin perder esa búsqueda instantánea implica agregar
  búsqueda por servidor (query `?buscar=`) o aceptar que la carga inicial siga siendo pesada.

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
tabla para MECANICO: EQUIPO / OT / OBSERVACIONES / TIEMPO ESTIMADO / TALLER-CAMPO (para OPERADOR es distinta, ver
"Ronda de mejoras..." más abajo). OBSERVACIONES = `RegistroActividad.observaciones` (el campo de texto libre que
anota el trabajador - esta columna se llamó "Daño" hasta una ronda posterior, ver esa misma sección, donde se
renombró para que coincida con lo que el usuario esperaba ver ahí). TIEMPO ESTIMADO = duración real calculada
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
  `*ngIf="grupo.operador.rol === 'OPERADOR'"` (nunca las dos a la vez). La de MECANICO quedó igual salvo un
  cambio (ver abajo). La de OPERADOR reemplaza OT/Daño/Taller-Campo (no aplican - un Operador no tiene Orden de
  Trabajo ni "daño" de taller) por **Horómetro inicio** / **Horómetro fin** (`reg.horometro_inicio`/
  `reg.horometro_final`) y **Observaciones** (`reg.observaciones`) - mantiene Tiempo estimado igual que la otra.
  `grupo.operador.rol` ya venía disponible en los datos (el include de `Operador` en `obtenerHistorial` no
  restringe `attributes`, trae la fila completa) - no hizo falta tocar el backend para esto.
- **Corrección de la misma ronda**: la columna "Daño" de la tabla de MECANICO se RENOMBRÓ a "Observaciones" (el
  dato detrás sigue siendo el mismo `reg.observaciones`, nunca cambió - "Daño" era la etiqueta original de una
  ronda mucho más antigua, pensada para reportar daños de taller). El usuario probó en producción, vio una hoja
  de un MECÁNICO con esa columna en "—" (sin dato en esos registros puntuales) y preguntó por qué no salía
  "Observaciones" ahí - la respuesta correcta no era "falta el dato", era que el pedido original ("agregar la
  columna de observaciones... en la tabla que se va a imprimir") se leyó como exclusivo de OPERADOR cuando en
  realidad pedía la etiqueta pareja en las dos tablas. Ver el bloque de abajo para el resto de lo que reveló esa
  misma prueba en producción.

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
nuevo `<select>` junto al de Hacienda en la pestaña **Historial** del Panel de Asistente, mismo patrón
(`supervisor_id` opcional en `GET /historial`, filtra `operador.supervisor_id` directo vía include). Reusa
`supervisores: Usuario[]` (ya cargado en el componente para el selector de "a qué hacienda pertenece" al
crear/editar un Operador) - no hizo falta un fetch nuevo.

**Corrección de la misma ronda - filtro incompleto, faltaba la pantalla que el usuario realmente probó**: "en
el panel del ADMIN" resultó ser ambiguo - lo implementé en el Historial (auditoría de jornadas ya cerradas), pero
el usuario lo probó en `/asistencia/supervisor` (**Panel de Control de Supervisor** - el "hoy" en vivo,
`obtenerAsistenciaHoy`/`supervisor-panel.ts`, accesible también a ADMIN vía `roleGuard('ADMIN','SUPERVISOR')`) y
ahí no hay filtro de ningún tipo, todo el mundo confirmó por captura de pantalla. Se agregó el mismo patrón
también ahí:
- Backend (`obtenerAsistenciaHoy`): mismo filtro `supervisor_id` opcional, mismo include condicional sobre
  `Operador`. Deliberadamente NO toca `calcularDiaCerrado` (sigue calculado sobre el día completo sin filtrar) -
  "Cerrar Jornada" tiene que seguir cerrando el día real sin importar qué filtro de vista tenga puesto quien lo
  ejecuta.
- Frontend (`supervisor-panel.ts`/`.html`): el selector solo se muestra con `*ngIf="esAdmin"` (mismo getter que
  ya usa `admin-panel.ts`) - un Supervisor real no tiene sentido de negocio filtrando por "otro Supervisor" (y de
  cualquier forma esta pantalla no lo aísla a su propia hacienda hoy, ver Deuda técnica heredada: "finalizarDia
  no filtra por hacienda_id" - el mismo hueco aplica aquí, no se tocó, es un tema aparte).

## Flujo de trabajo de esta sesión

Backend: todo cambio se prueba primero contra Postgres local (`service postgresql start`, rol `postgre`/`1234`,
BD `horometros_db`) antes de darse por terminado. Migraciones nuevas van numeradas después de la última existente.

Frontend: mientras no esté empaquetado nativo, se prueba en el navegador contra el link de Vercel (o `ng serve` local
apuntando al backend real de Render) - no hace falta empaquetar para cada prueba.
