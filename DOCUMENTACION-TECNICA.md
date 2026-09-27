# FRUGALP - Documentación Técnica del Sistema

Guía de referencia para cualquier programador que retome este proyecto. Explica cómo funciona el sistema
**hoy**, no la historia de cómo se construyó (esa bitácora completa, con el detalle de cada decisión y cada
bug encontrado en el camino, vive en `CLAUDE.MD` - léelo si necesitas el "por qué" detrás de algo de aquí).

## 1. Qué hace el sistema

Control de asistencia y labores para una empresa agrícola (~950 trabajadores de campo/taller + ~150 de
oficina). Reemplaza el registro en papel: los trabajadores marcan entrada/salida por código o QR, registran
sus labores del día (equipo usado, actividad, horómetro si aplica), y los supervisores validan/cierran la
jornada. Incluye una app móvil empaquetada (Android nativo + PWA para iPhone) para que el registro funcione
desde el campo.

## 2. Stack tecnológico

| Capa | Tecnología |
|---|---|
| Backend | Node.js + Express + TypeScript + Sequelize (ORM) sobre PostgreSQL |
| Frontend | Angular 22 (standalone components, sin NgModules) + Tailwind CSS |
| Hosting backend | Render (Postgres administrado + servidor Node) |
| Hosting frontend | Vercel |
| App móvil | Capacitor (empaqueta el mismo frontend Angular como app Android nativa) + PWA-lite para iPhone (sin costo de Apple Developer) |
| Autenticación | JWT propio (sin proveedor externo) |
| Pruebas | Vitest (unitarias + integración), Playwright (E2E), autocannon (carga), MobSF + OWASP ZAP (seguridad) |

## 3. Roles del sistema

| Rol | Vive en tabla | Qué hace | Pantalla "hogar" |
|---|---|---|---|
| ADMIN | `usuarios` | Todo el sistema | `/dashboard` |
| ASISTENTE | `usuarios` | Gestión de personal, historial de asistencia, crea usuarios de oficina | `/dashboard` |
| SUPERVISOR | `usuarios` | Una hacienda fija: valida marcaciones, confirma O/X, cierra jornada | `/dashboard` |
| ESCANER | `usuarios` | Dispositivo fijo de un punto de control físico, solo escanea | `/escaner` |
| MECANICO / OPERADOR | `operadores` | Trabajador de taller/campo | `/mi-jornada` |

**Por qué Operador no vive en `usuarios`:** ya existe `operadores` para identificar a esa persona (código,
cédula, carnet QR); duplicarla en `usuarios` desincronizaría los datos con el tiempo. En su lugar,
`operadores` tiene columnas propias `usuario`/`clave_hash`/`supervisor_id`.

Cada rol tiene su propia ruta "hogar" (`core/utils/rutas-por-rol.ts`, función `rutaHomePorRol`) y nunca ve un
menú compartido con otros roles vía `*ngIf` - login, guards y el botón "Menú" del header usan esa misma
función como única fuente de verdad.

## 4. Cómo se marca asistencia (2 caminos, decididos automáticamente)

El camino que le toca a un trabajador **no se elige a mano** - se calcula solo en el login, según si la
hacienda tiene un Token de Hacienda vigente ahora mismo:

- **Camino A (Código):** la hacienda tiene un Token vigente (`haciendas.token_actual`, dura 24h, lo genera el
  Supervisor). El trabajador teclea su código, marca al instante.
- **Camino B (QR de sesión):** sin Token vigente. El trabajador ve un QR propio que se regenera cada 80s
  (vence a los 90s, nunca es una foto reusable) hasta que un Supervisor/Escáner lo escanea.

Ambos caminos llevan al **Panel de Actividades** tras la entrada: ahí el trabajador registra las labores
puntuales del día (equipo + actividad + hora, más horómetro si es OPERADOR o el número de OT si es MECANICO).
La salida es siempre una acción explícita del trabajador (botón "Marcar salida"), nunca automática.

Un cuarto camino, el **carnet físico** (`POST /api/asistencia/marcar-qr`, sin login), sigue existiendo para
kioscos públicos sin cambios. Los 4 caminos comparten el mismo núcleo de lógica (`procesarMarcacion` en
`asistencia.controller.ts`) para no triplicar reglas de negocio como el cruce de medianoche.

## 5. Modelo de datos (tablas principales)

| Tabla | Contenido clave |
|---|---|
| `haciendas` | nombre, token_actual, token_expira_en |
| `usuarios` | cuentas de oficina (ADMIN/ASISTENTE/SUPERVISOR/ESCANER), cargo, hacienda_id (solo Supervisor/Escáner) |
| `operadores` | trabajadores de campo/taller, rol (MECANICO/OPERADOR), supervisor_id, PII cifrada (ver Seguridad) |
| `asistencias` | una fila por jornada: estado (EN_JORNADA/PENDIENTE_REVISION/FINALIZADO/SALIDA_OLVIDADA/OBSERVANDO), confirmado_por_supervisor |
| `registro_actividades` | labores puntuales dentro de una jornada (equipo, actividad, horómetro) |
| `equipos` / `actividades` | catálogos, con soft-delete |
| `registros_auditoria` | quién hizo qué (creación/edición de cuentas, resets de clave) |
| `registros_dispositivo` | telemetría de qué SO/versión usa cada dispositivo que entra por la app empaquetada |

El estado de una `Asistencia` es la máquina de estados central del sistema - casi toda regla de negocio se
apoya en él (ver `CLAUDE.MD`, sección "O/X" y "Reglas de negocio confirmadas", para el detalle de las
transiciones).

## 6. Seguridad (lo que ya está implementado)

- **PII cifrada en reposo:** cédula (cifrado determinístico, permite búsqueda exacta pero no parcial),
  teléfono/dirección (cifrado con IV aleatorio). Clave en `CIFRADO_CLAVE` (variable de entorno, 32 bytes hex).
- **JWT propio**, 8h para cuentas de oficina; para Operador, la sesión queda atada a su jornada (no a un
  tiempo fijo) - se corta si la jornada se cierra aunque el token siga sin expirar.
- **Revocación de sesión:** cambiar la clave invalida cualquier JWT emitido antes de ese cambio
  (`sesion_valida_desde` en la cuenta, comparado contra el `iat` del token en cada request).
- **Rate limiting** en login y en marcación por código (`limitadorLogin`/`limitadorMarcacion`).
- **RBAC por endpoint:** `verificarAutenticacion` + `requireRol(...)` en cada ruta que lo necesita - ver la
  tabla de Endpoints abajo para qué rol exige cada una.
- **Auditoría:** `registros_auditoria` guarda quién creó/editó cuentas y reseteos de clave.
- **Errores nunca exponen detalles internos al cliente:** cualquier 500 responde solo un mensaje genérico
  (`console.error` en el servidor, nunca el objeto de error crudo en la respuesta HTTP - corregido en
  38 lugares tras una auditoría con OWASP ZAP).
- Auditado con **MobSF** (análisis estático del .apk) y **OWASP ZAP** (Active Scan del backend) - hallazgos
  reales encontrados y corregidos, documentados con fecha en `CLAUDE.MD`.

## 7. Endpoints principales

| Método/Ruta | Rol requerido | Qué hace |
|---|---|---|
| POST /api/auth/login | público | Login único (usuarios u operadores) |
| POST /api/asistencia/marcar-qr | público | Carnet físico clásico |
| POST /api/asistencia/marcar-codigo | público | Camino A sin sesión previa |
| GET /api/asistencia/mi-qr | operador, jornada activa | Camino B: genera el QR de 90s |
| POST /api/asistencia/marcar-qr-sesion | ADMIN, SUPERVISOR, ESCANER | Camino B: escanea y marca |
| PUT /api/asistencia/:id/confirmar | SUPERVISOR, ADMIN | O/X de asistencia |
| GET /api/asistencia/hoy | ADMIN, SUPERVISOR | Reporte del día, paginado |
| POST /api/asistencia/finalizar-dia | ADMIN, SUPERVISOR | Cierra la jornada del día |
| GET /api/asistencia/historial | ADMIN, ASISTENTE | Historial con filtros de fecha |
| GET/POST/PUT/DELETE /api/asistencia/operadores | ADMIN, ASISTENTE | CRUD de trabajadores |
| GET/POST/PUT/DELETE /api/equipos | según acción | Catálogo de equipos |
| GET/POST/PUT/DELETE /api/actividad | según acción | Catálogo de actividades |
| GET/POST /api/haciendas | ADMIN/SUPERVISOR | Haciendas y su Token |
| GET/POST/PUT /api/usuarios | ADMIN, ASISTENTE | Cuentas de oficina |

Lista completa (con cada endpoint del módulo de registro de actividades y auditoría) en `CLAUDE.MD`, sección
"Endpoints".

## 8. Decisiones de arquitectura que hay que respetar (para no romper el sistema)

- **`ChangeDetectorRef.detectChanges()` explícito** después de cualquier respuesta HTTP que mute un campo
  plano del componente (no-signal) - el `zone.js` de este proyecto no lo dispara solo. Omitirlo en un
  componente nuevo produce bugs silenciosos de UI desactualizada.
- **Nunca insertar/actualizar `codigo_megued`, `cedula` o `usuario` sin chequear duplicados antes** - usa el
  patrón ya existente (`verificarDuplicadosOperador` en `asistencia.controller.ts`) que responde 409 con un
  mensaje claro, en vez de dejar que el error crudo de Postgres se filtre.
- **El offline-first (`OfflineSyncService`) solo cubre el Panel de Actividades** (crear/finalizar una labor).
  La entrada/salida (código o QR) siempre necesita conexión real - el servidor tiene que validar el código o
  generar el QR en el momento, eso no se puede hacer sin señal.
- **El QR de jornada dura 90 segundos a propósito** - no es el `operador_id` fijo, es un JWT corto que se
  regenera solo. Cambiar esto a un valor estático reintroduce el problema que resolvió (una foto del QR
  serviría indefinidamente).
- **La app empaquetada (Capacitor) sirve el WebView desde el origen fijo `https://localhost`**, sin importar
  el dominio real de despliegue - si `CORS_ORIGIN` se configura a mano en Render, hay que incluir
  `https://localhost` en la lista o el login de la app empaquetada se rompe.
- **Historial de Asistencia solo muestra jornadas ya cerradas** (`FINALIZADO`/`SALIDA_OLVIDADA`) con
  `confirmado_por_supervisor` no nulo - es la auditoría oficial, nunca debe mostrar algo que el Supervisor no
  haya revisado todavía.

## 9. Cómo levantar el proyecto en local

**Backend** (`backend-horometros/`):
1. Postgres corriendo (local o Docker), base de datos creada.
2. `.env` con `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `CIFRADO_CLAVE` (32
   bytes hex, `openssl rand -hex 32`).
3. `npm install && npm run db:migrate && npm run dev` (puerto 3000 por defecto).

**Frontend** (`frontend-horometros/`):
1. En `src/environments/environment.development.ts`, `apiUrl` apuntando al backend (local o Render).
2. `npm install && npm start` (puerto 4200 por defecto).

**Primer usuario ADMIN:** no existe endpoint para crearlo (exige ya estar logueado como ADMIN) - se inserta
directo por SQL contra la tabla `usuarios`, con la clave hasheada con bcrypt (`bcrypt.hash(clave, 10)`).

## 10. Estado del proyecto / pendientes conocidos

- Build de **release** firmado (hoy sigue siendo debug) antes de distribuir el .apk de verdad.
- Probar en iPhone real y 2-3 marcas de Android distintas.
- Backups automáticos y monitoreo de caídas (Sentry/uptime) - no configurados todavía.
- Exportar a Excel e "Imprimir general" del Directorio (diseños de Figma ya confirmados, sin construir).

Lista completa y actualizada, con el detalle de cada punto, en `CLAUDE.MD`, sección "Pendiente".
