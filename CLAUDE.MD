# FRUGALP — Asistencia y Horómetros (Arquitectura & Reglas)

Sistema multi-rol de asistencia por Kiosco QR y registro de actividades agrícolas/taller para FRUGALP Agrícola Exportadora.
Monorepo: `frontend-horometros/` (Angular standalone) y `backend-horometros/` (Node/Express + Sequelize + Postgres).

---

## 1. Reglas de Negocio Clave
- **Roles:**
  - `ADMIN` y `ASISTENTE` (`usuarios`): Globales.
  - `SUPERVISOR` (`usuarios`): Restringido a 1 hacienda en BD (`UNIQUE hacienda_id`).
  - `MECANICO` y `OPERADOR` (`operadores`): Login por usuario/clave + QR físico. Asignados a su supervisor.
- **Autenticación:** JWT stateless para sesiones (no guardar en BD). Token de Hacienda (24h) en BD para habilitar kiosco.
- **Trabajadores Prestados:** Trabajan el día completo en la hacienda receptora. Se registra `hacienda_prestamo_id` y `admitido_por_usuario_id` en `asistencias`. `Operador.supervisor_id` no cambia.
- **Offline-First:** Panel de Actividades usa IndexedDB + Sincronización manual/periódica (evitar Background Sync API por iOS).

---

## 2. Flujo de Asistencia (Kiosco & Paneles)

### A. Punto de Marcación (Kiosco)
- **Entrada:** Escaneo de QR + captura de foto de evidencia disimulada (**visores de cámara ocupan máximo 40% de pantalla** para evitar que el operador note la captura).
- **Salida:** Escaneo de QR + interfaz para registrar 1 o más actividades antes de confirmar salida.

### B. Evidencia Fotográfica
- Capturas almacenadas en servidor/S3 o codificadas. Se guarda la URL/Ruta en la columna `evidencia` del registro.
- En la UI, al dar clic en la opción de evidencia, despliega un **modal / ventana flotante con la imagen**.

### C. Panel Supervisor (Validación Diaria)
- Revisa marcaciones de la jornada activa o día anterior (horas, actividades, evidencias).
- Registra observaciones si detecta irregularidades.
- Botón **"Finalizar Día"**: cierra la jornada, invalida el token de hacienda y congela datos.

### D. Panel Asistente (Auditoría)
- Directorio de carnets QR + pestaña "Historial de Asistencia" con filtro por fecha.
- Muestra lista de mecánicos, total de horas, desglose de actividades, fotos de evidencia y observaciones del supervisor.

---

## 3. Estructura de Base de Datos
- **`usuarios`**: Admin, Asistente, Supervisor (`hacienda_id` UNIQUE).
- **`operadores`**: Mecánicos y Operadores (`supervisor_id`, `usuario`, `clave_hash`).
- **`haciendas`**: (`token_actual`, `token_expira_en`).
- **`asistencias`**: (`diesel_consumido`, `hacienda_prestamo_id`, `admitido_por_usuario_id`).
- **`registro_actividades`**: Cuelga de `asistencia_id` (`equipo_id`, `actividad_id`, `seccion_id`, `horometro_inicio/final`, `hora_inicio/fin`, `observaciones`).
- **`secciones`**: Sub-áreas por hacienda (`hacienda_id`).

---

## 4. Guía de Desarrollo & Workflow
- **Diseño UI:** 100% Responsive / Compatible con todos los dispositivos (móvil, tablet, desktop).
- **Git:** Trabajo en rama `main` de `RonaldAcurio/Horometros_FRUGALP`. **Nunca hacer push directo.**
- **Testing Local:** Probar siempre en Postgres local (`DB_USER=postgre`, `DB_PASSWORD=1234`, `DB_NAME=horometros_db`) y Playwright antes de entregar.
- **Entregas:** Revertir cambios de sandbox (`git checkout --`), explicar decisiones técnicamente y entregar código en el chat para aplicación manual.