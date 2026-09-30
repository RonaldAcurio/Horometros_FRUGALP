# FRUGALP - Sistema de Asistencia

Sistema de control de asistencia y actividades diarias para el personal de campo y taller de una empresa
agrícola (FRUGALP AGRICOLA EXPORTADORA G-P CIA. LTDA.). Reemplaza el registro en papel: cada trabajador marca su
entrada y salida, registra las labores que realiza durante su jornada, y los supervisores validan y cierran el
día desde un panel de control.

## Qué hace

### Marcación de entrada y salida

Cada Mecánico u Operador marca su jornada de una de estas formas, según cómo esté configurada su hacienda ese
día:

- **Con código**: escribe su usuario, clave y un código temporal que genera el Supervisor de su hacienda (válido
  24 horas). Puede hacerlo sin conexión a una pantalla especial, incluso desde un punto de marcación compartido.
- **Con QR**: se loguea una sola vez y su celular muestra un código QR que se renueva solo. Un Supervisor o una
  cuenta de escáner (un dispositivo fijo en la entrada de la hacienda) lo escanea para registrar su entrada o
  salida.
- **Con carnet físico**: un carnet QR impreso, para quien no tiene o no usa su propio celular.

Si un trabajador está prestado a otra hacienda por un día, el sistema lo detecta y lo registra automáticamente
bajo la hacienda donde de verdad trabajó, sin trámite manual.

Si alguien no logra marcar su salida por el camino normal (se le hace tarde, no puede volver a un punto de
control), puede cerrar su propia jornada como "salida olvidada" desde su celular - queda marcada para que el
Supervisor la revise.

### Registro de actividades del día

Una vez con la jornada abierta, cada trabajador registra las labores puntuales que realiza: contra qué equipo
trabajó, qué actividad hizo, a qué hora empezó y terminó. Los Operadores además registran el horómetro inicial y
final del equipo; los Mecánicos registran la Orden de Trabajo. Todo esto funciona **sin conexión a internet**: se
guarda en el celular y se sincroniza solo apenas vuelve la señal.

### Panel del Supervisor

Cada Supervisor ve, para su propia hacienda, quién marcó presente hoy. Confirma con un botón O/X si cada persona
realmente vino a trabajar (protege contra que alguien use el código o QR de un compañero ausente). Al final del
día, cierra la jornada - una vez cerrada, el reporte queda congelado y pasa al historial oficial.

### Panel de la Asistente / Administración

- **Directorio de Operadores**: alta, edición y baja de trabajadores, con sus credenciales de acceso.
- **Historial de Asistencia**: consulta de jornadas ya cerradas, con filtros por fecha, hacienda y supervisor.
  Cada jornada se puede ver e imprimir como hoja física individual, o imprimir varias juntas por rango de fechas.
- **Catálogos de Equipo y Actividad**: alta/edición/baja, con importación masiva desde una plantilla de Excel
  para cargar cientos de registros de una sola vez.
- **Usuarios**: creación de cuentas de Administrador, Asistente, Supervisor y Escáner, cada una atada a su
  hacienda cuando corresponde.
- **Haciendas**: alta de haciendas nuevas y generación/invalidación de su código de acceso temporal.
- **Términos y Privacidad**: quién ya aceptó la Política de Privacidad y Términos de Uso, y quién todavía no.
- **Historial de auditoría** (solo Administrador): quién reseteó una clave o generó/invalidó un código de
  hacienda, y cuándo.

### Evidencia fotográfica

Al marcar su entrada, el trabajador puede quedar registrado con una foto de evidencia. Solo se consulta cuando
alguien de oficina hace clic en "Ver Evidencia" sobre un registro puntual.

### Aplicación móvil

La app corre como aplicación nativa de Android (instalable directo, sin Play Store) para el personal de campo, y
como app web instalable desde el navegador (Safari) en iPhone. Funciona sin conexión para el registro de
actividades del día.

## Roles

| Rol | Qué puede hacer |
|---|---|
| Administrador | Todo el sistema. |
| Asistente | Directorio de personal, Historial, catálogos, cuentas de oficina. |
| Supervisor | Validación diaria y cierre de jornada de su propia hacienda. |
| Escáner | Cuenta de un punto de control físico, solo escanea/confirma. |
| Mecánico / Operador | Marca su propia jornada y registra sus labores del día. |

## Infraestructura

- **Frontend**: [Vercel](https://vercel.com)
- **Backend y base de datos**: [Railway](https://railway.com)
- **Almacenamiento de fotos de evidencia**: [Cloudflare R2](https://developers.cloudflare.com/r2/)
