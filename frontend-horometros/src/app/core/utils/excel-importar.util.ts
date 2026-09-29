import * as XLSX from '@e965/xlsx';

/*
Utilidad compartida para "Importar desde Excel" (pestañas Equipo/Actividad del Panel de Asistente, pedido del
usuario 2026-09-29: tienen 300+ equipos y cargarlos uno por uno "se van a comer la camisa"). El parseo del
.xlsx vive en el navegador (SheetJS/@e965-xlsx, el mismo re-publish mantenido de la librería original - el
paquete "xlsx" de npm quedó con 2 CVEs sin parche disponible ahí) - el backend solo recibe el JSON ya mapeado,
nunca el archivo crudo.
*/

// Quita tildes/mayúsculas para poder comparar encabezados escritos a mano sin ser estricto con el formato exacto.
const normalizarEncabezado = (texto: string): string =>
    texto.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export interface ColumnaExcel<T> {
    clave: keyof T;
    // Variantes de encabezado aceptadas para esta columna, YA normalizadas (ver normalizarEncabezado).
    encabezados: string[];
}

/*
Lee la PRIMERA hoja de un archivo .xlsx/.xls y lo mapea a un arreglo de objetos según `columnas` (cada columna
declara qué encabezados de texto acepta, insensible a mayúsculas/tildes). Filas completamente vacías se
descartan (Excel suele dejar filas en blanco al final) - la validación de campos faltantes por fila queda del
lado del backend, que es quien conoce las reglas de negocio reales (ver equipo.controller.ts/actividades.controller.ts).
*/
export async function leerFilasExcel<T extends Record<string, string>>(
    archivo: File,
    columnas: ColumnaExcel<T>[]
): Promise<T[]> {
    const buffer = await archivo.arrayBuffer();
    const libro = XLSX.read(buffer, { type: 'array' });
    const primeraHoja = libro.Sheets[libro.SheetNames[0]];
    if (!primeraHoja) return [];

    const filasCrudas = XLSX.utils.sheet_to_json<Record<string, unknown>>(primeraHoja, { defval: '' });

    return filasCrudas
        .map((filaCruda) => {
            const encabezadosFila = Object.keys(filaCruda);
            const fila = {} as T;
            for (const columna of columnas) {
                const encabezadoCoincidente = encabezadosFila.find((h) =>
                    columna.encabezados.includes(normalizarEncabezado(h))
                );
                const valor = encabezadoCoincidente ? filaCruda[encabezadoCoincidente] : '';
                (fila as Record<string, string>)[columna.clave as string] = String(valor ?? '').trim();
            }
            return fila;
        })
        .filter((fila) => Object.values(fila).some((valor) => String(valor).trim() !== ''));
}

// Descarga una plantilla .xlsx con solo la fila de encabezados - guía al usuario sobre el formato exacto que
// espera leerFilasExcel, sin arriesgarse a que filas de ejemplo terminen importándose como datos reales.
export function descargarPlantillaExcel(nombreArchivo: string, nombreHoja: string, encabezados: string[]): void {
    const hoja = XLSX.utils.aoa_to_sheet([encabezados]);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, nombreHoja);
    XLSX.writeFile(libro, nombreArchivo);
}
