FRUGALP empresa agricola, estoy como pasante tratando de crear una aplicacion de asistencia el cual tiene el siguietne flujo:
-tiene un panel donde escoge ASISTENCIA y HOROMETRO(aqui trato de crear un OCR con genai 3.5), por el momento necesito enfocarme en la opcion de ASISTENCIA
Flujo de ASISTENCIA:

1. Punto de Marcación (Kiosco):

-Entrada: El operador/mecánico escanea su QR (se toma la foto captura como evidencia).

-Salida: Vuelve a escanear su QR y el sistema le despliega una interfaz para agregar 1 o más actividades realizadas antes de confirmar la salida.

En esta parte cuando hace la capture solo necesito que muestre la pantalla del escaner en un 40% para que el operador/mecanico no se percate que le van a tomar una capture

2. Panel de Supervisor (Validación Diaria):

-Revisa las marcaciones del día anterior (o jornada activa).

-Puede ver las horas, las múltiples actividades registradas por cada mecánico y las fotos de evidencia.

-Si detecta algo irregular, agrega una Observación.

-Hace clic en "Finalizar Día" para cerrar la jornada y congelar los datos.

3. Panel de Asistente (Auditoría y Gestión de Personal):

-Además del directorio de operadores/carnets QR, cuenta con una pestaña de "Historial de Asistencia".

-Incluye un filtro por calendario/fecha para consultar cualquier día pasado (semana, mes, etc.).

-Muestra la lista de mecánicos que trabajaron ese día con su total de horas, el desglose de sus múltiples actividades, las fotos de evidencia y las observaciones del supervisor.

Tambien necesito de alguna manera poder guardar las captures que se realizan en cada registro hacerlas de alguna manera no pesen tanto podriamos guardar la URL en la BD y en el backend hacer fotograma base 64 en una carpeta ir guardando o incluso en un servidor de almacenamiento como AWS S3 / Cloudinary y de ahi agregar una columna que diga evidencia en cada usuario y cuadno demos click en una opcion de la evidencia nos abra una ventana flotante con la imagen