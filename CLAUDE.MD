# FRUGALP — Horometros (Arquitectura de referencia)

FRUGALP Agrícola Exportadora (la piñera más grande de Ecuador). Sistema de asistencia que arrancó como kiosko QR sin autenticación y está en pivote hacia multi-rol con login, escalado a varias haciendas. **Este documento es la fuente de verdad** — si el código contradice algo de aquí, avisar antes de asumir cuál de los dos manda.

Stack: Angular (standalone) + Node/Express/TypeScript + Sequelize + Postgres (Render). Monorepo:
`frontend-horometros/` y `backend-horometros/`.

## Los 2 módulos del sistema

- **Asistencia** (foco actual, todo este documento es sobre esto).
- **Horómetros** (aparte, `ingresos_semanales` + `horometros.controller.ts`, OCR con Gemini vía
  `@google/genai`) — **no tocar** al trabajar en Asistencia. Puede llegar a cruzarse con el futuro
  Panel de Actividades de Operador (ambos leen horómetro de equipo), pero es una fusión a evaluar
  después, no asumir que ya están conectados.

## Roles

| Rol        | Vive en      | Login                     | Alcance                             |
|------------|--------------|---------------------------|-------------------------------------|
| ADMIN      | `usuarios`   | usuario+clave             | Global                              |
| ASISTENTE  | `usuarios`   | usuario+clave             | Global                              |
| SUPERVISOR | `usuarios`   | usuario+clave             | 1 hacienda (UNIQUE en BD)           |
| MECANICO   | `operadores` | usuario+clave + QR físico | Su hacienda (vía su Supervisor)     |
| OPERADOR   | `operadores` | usuario+clave + QR físico | Su hacienda. Fase 2, sin UI todavía |

`operadores` ya identificaba a Mecánico/Operador antes del pivote (código, cédula, QR) — por eso sus credenciales son columnas ahí, no una tabla aparte. `usuarios` es exclusiva de roles de oficina, que no existían antes del pivote.

## Reglas de negocio confirmadas

1. 1 Supervisor activo por hacienda — UNIQUE real en BD, no solo validación de app.
2. Trabajador prestado: trabaja el **día completo** en la hacienda receptora, nunca reparte el día.
   `asistencias.hacienda_prestamo_id` (receptora) + `admitido_por_usuario_id` (quién lo admitió).
   `Operador.supervisor_id` (asignación permanente) nunca cambia por esto.
3. **Token de Hacienda** (`haciendas.token_actual`/`token_expira_en`): lo genera el Supervisor,
   24h, regenerable, habilita el escaneo QR de su hacienda. Vive en BD porque cada escaneo lo
   consulta. Distinto del **JWT de sesión** (login), que es stateless y nunca se guarda en BD.
4. Cierre de jornada debe ser **por hacienda** — cada Supervisor cierra solo la suya.
   ⚠️ **Hoy NO es así**: `finalizarDia` cierra todas las haciendas juntas en una fecha, sin
   distinguir (es el mismo endpoint de antes del pivote, no se ha tocado). Falta reescribirlo
   para que reciba/valide una hacienda, y ahí sí conectarlo con invalidar el Token de esa hacienda.
5. Kiosco: captura de evidencia disimulada, visor de cámara ≤40% de pantalla para que el
   operador no note la foto.
6. Offline-first en Panel de Actividades: IndexedDB + sincronización manual/periódica — decisión
   tomada explícitamente en vez de la Background Sync API (sin soporte en iOS/Safari).
7. Exportar a Excel: en pausa hasta que el ING mande el formato de muestra. No implementar
   proactivamente.
8. `Actividad.aplica_a_rol` distingue Mecánico vs Operador; `categoria` (TALLER/CAMPO) es
   subetiqueta libre, no el filtro real.
9. `registro_actividades.observaciones` es un campo **compartido**: el Mecánico anota su OT ahí,
   el Operador su implemento — mismo campo, el frontend cambia la etiqueta según el rol.

## Tablas (estado real de tu Postgres de producción)

Ya existían antes del pivote: `operadores`, `actividades`, `equipos`, `asistencias`,
`asistencia_actividades` (pivote m:n), `ingresos_semanales`.

Agregadas en el pivote (todas migradas y probadas con datos reales):
- `haciendas` (nombre, token_actual, token_expira_en) — seed: Santa Clara, Rancho Brahman, Terranova.
- `usuarios` (nombre_completo, usuario, clave_hash, cargo, activo, hacienda_id UNIQUE).
- `secciones` (nombre, hacienda_id) — sub-áreas dentro de una hacienda.
- `registro_actividades` (asistencia_id, equipo_id, actividad_id, area, seccion_id,
  horometro_inicio/final, hora_inicio/fin, observaciones) — Panel de Actividades.
- `operadores` +`supervisor_id`, +`usuario`, +`clave_hash`.
- `asistencias` +`diesel_consumido`, +`hacienda_prestamo_id`, +`admitido_por_usuario_id`.

## Endpoints construidos y probados

| Método | Ruta | Auth | Qué hace |
|---|---|---|---|
| POST | `/api/auth/login` | — | Login único Usuario u Operador, devuelve JWT |
| POST | `/api/asistencia/marcar-qr` | — (sin JWT, pre-pivote) | Entrada/salida por QR |
| POST | `/api/asistencia/finalizar-dia` | — (sin JWT, pre-pivote) | ⚠️ Cierra TODAS las haciendas, ver regla 4 |
| GET/PUT | `/api/asistencia/hoy`, `/historial`, `/revisar/:id`, `/:id/foto`, `/operadores` | — (sin JWT, pre-pivote) | Paneles Supervisor/Asistente |
| POST | `/api/asistencia/admitir-externo` | JWT, SUPERVISOR/ADMIN | Trabajador prestado (regla 2) |
| PUT | `/api/asistencia/operadores/:id/clave` | JWT, ADMIN/ASISTENTE | Resetea clave de Operador |
| POST/PUT/GET | `/api/registro-actividades` | JWT, cualquier rol | Crear/finalizar/listar labores. Un Mecánico/Operador solo toca SU jornada; un rol de oficina toca cualquiera (`puedeOperarSobre`) |
| POST/DELETE | `/api/haciendas/:id/token` | JWT, ADMIN/SUPERVISOR (propia hacienda) | Generar/invalidar Token de Hacienda |
| PUT | `/api/usuarios/:id/clave` | JWT, ADMIN | Resetea clave de Usuario |

## Deuda técnica heredada (no confundir con bugs nuevos)

- `equipos` se creó antes de que existieran migraciones (`sync()` antiguo) y no tenía
  `PRIMARY KEY` real en `id` — **ya reparado**. Si un día aparece "no unique constraint matching
  given keys" al agregar una FK hacia otra tabla vieja (`operadores`, `actividades`,
  `asistencias`), sospechar de lo mismo: verificar con `\d <tabla>` antes de asumir que es un
  bug de la migración nueva.
- La primerísima migración del proyecto asume que `operadores` ya existe — falla en una BD
  vacía de verdad. No afecta producción (esas tablas ya existen ahí).

## Pendiente

**Backend:**
- `crearUsuario` — el Admin da de alta Supervisor/Asistente/Admin. No existe todavía, ni
  siquiera el Menú Admin va a tener qué llamar cuando se construya.
- `crearOperador`/`actualizarOperador` con `usuario`/`clave` opcionales — hoy no hay forma de
  asignarle credenciales a un trabajador nuevo por primera vez (solo se puede *resetear* una
  que ya existe).
- Reescribir `finalizarDia` para que sea por hacienda (regla 4), y ahí sí conectarlo con
  invalidar el Token de esa hacienda.
- Conectar el escáner del kiosco con el Token de Hacienda — hoy el kiosko sigue siendo de
  acceso libre, sin validar ningún token.

**Frontend (nada iniciado todavía):**
- Login único y condicional (detecta rol, redirige al panel correcto).
- Ventana flotante con el QR propio del Mecánico/Operador tras login.
- Route guards por rol.
- Panel de Actividades (Mecánico primero; Operador es fase 2, confirmado con el ING).
- Sincronización offline-first (IndexedDB) para el Panel de Actividades.
- Menú Admin (pantalla nueva).
- Diseño responsive en todos los paneles nuevos.

## Flujo de trabajo con el usuario

- El usuario aplica y sube el código él mismo a su GitHub — nunca hacer push directo a su repo.
- Antes de entregar cualquier fix no trivial: probarlo contra Postgres local (`DB_USER=postgre`,
  `DB_PASSWORD=1234`, `DB_NAME=horometros_db`, `DB_HOST=localhost`), y Playwright con cámara
  falsa cuando aplique al frontend. Nunca asumir que algo funciona sin correrlo.
- Revertir siempre los cambios de sandbox después de probar; entregar el código final en el
  chat para que el usuario lo aplique.
- Explicar cada pieza de código y cada decisión como clase — vocabulario técnico correcto,
  explicando el porqué, no solo el qué.
- Checklist empresarial por fase: Requisitos → Arquitectura → Base de Datos → Backend →
  Frontend → QA → Entrega → Verificación. No saltar de fase sin cerrar la anterior. Modo
  instructor: decidir las cuestiones técnicas y explicar el razonamiento, no dejarlas como
  preguntas abiertas salvo que dependan de información que solo la empresa/el ING tienen.
- Bitácora de seguimiento granular (artifact "Checklist FRUGALP") separada de este documento de
  arquitectura.