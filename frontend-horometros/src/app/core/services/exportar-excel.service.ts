import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
// '@e965/xlsx' (usado para la plantilla de importar, ver excel-importar.util.ts) no soporta combinar celdas,
// colores ni fuentes en su version gratuita - "Exportar a Excel" (pedido del usuario, 2026-10-01) SI necesita
// todo eso para calcar el diseno de REGISTRO DE LABORES DIARIAS que ya usan en papel, asi que usa ExcelJS aparte.
import { Workbook, FillPattern, CellValue } from 'exceljs';
import { Operador, RegistroActividad } from '../models/asistencia.model';

/*
==================== "Exportar a Excel" ====================
Reporte SIEMPRE de un solo dia (asi lo manejan en papel) calcando el diseno real "REGISTRO DE LABORES
DIARIAS" - plantilla provista por el usuario, 2026-10-01. Extraido de asistencia-panel.ts (2026-10-02) a un
servicio compartido: el Panel de Supervisor tambien necesita generar el mismo Excel (boton "Exportar a Excel"
filtrado al dia que esta viendo), y antes esto solo vivia ahi como metodo privado - duplicar ~170 lineas de
armado de celdas en dos paginas hubiera significado mantener dos copias idénticas a mano.
*/
@Injectable({ providedIn: 'root' })
export class ExportarExcelService {
  async generarYDescargar(
    bloques: { operador: Operador; registros: RegistroActividad[] }[],
    fecha: string,
    nombreHacienda: string,
    nombreSupervisor: string,
  ): Promise<void> {
    // 'fecha' es un string YYYY-MM-DD puro (sin hora) - se interpreta en UTC a proposito (new Date() de un
    // string asi SIEMPRE cae en UTC medianoche) para que el dia de la semana no cambie segun la zona horaria
    // de quien genera el reporte.
    const fechaDate = new Date(`${fecha}T00:00:00Z`);
    const diaSemana = this.DIAS_SEMANA_ES[fechaDate.getUTCDay()];
    const semana = this.numeroSemanaISO(fechaDate);
    const [anio, mes, dia] = fecha.split('-');
    const fechaDDMMYYYY = `${dia}${mes}${anio}`;

    const wb = new Workbook();
    const ws = wb.addWorksheet('Hoja1', { views: [{ showGridLines: false }] });

    // Anchos de columna (los que trae medidos la plantilla real; el resto se deja en un ancho razonable).
    const anchos = [6, 12, 8, 27.66, 10, 11.5, 9, 12.33, 12, 23.83, 16.33, 14.33, 12, 10, 32];
    anchos.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    const BORDE_FINO = { style: 'thin' as const, color: { argb: 'FF000000' } };
    const BORDES_TODOS = { top: BORDE_FINO, bottom: BORDE_FINO, left: BORDE_FINO, right: BORDE_FINO };
    const FUENTE_BASE = { name: 'Aptos Narrow', size: 12 };
    const CENTRADO = { horizontal: 'center' as const, vertical: 'middle' as const, wrapText: true };
    const AMARILLO: FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
    const AZUL_CLARO: FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };
    const VERDE_CLARO: FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
    const VERDE_MEDIO: FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6E0B4' } };
    const MORADO_CLARO: FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4DFEC' } };

    const celda = (coord: string, valor: unknown, opciones: { fill?: FillPattern; bold?: boolean; size?: number } = {}) => {
      const c = ws.getCell(coord);
      c.value = valor as CellValue;
      c.font = { ...FUENTE_BASE, bold: !!opciones.bold, size: opciones.size ?? FUENTE_BASE.size };
      c.alignment = CENTRADO;
      c.border = BORDES_TODOS;
      if (opciones.fill) c.fill = opciones.fill;
      return c;
    };

    /*
    Logo: 'logo-excel.png' es el isotipo RECTANGULAR (con el nombre "FRUGALP Agricola Exportadora" a un
    lado), distinto de 'logo-source.png' (el icono CUADRADO que usa el resto de la app - manifest.json, PWA -
    ese no sirve aca, forzarlo a un recuadro ancho lo deformaba y quedaba irreconocible, bug real reportado
    por el usuario comparando contra la plantilla real). Se ancla con tl/ext (tamano en pixeles fijo) en vez
    de estirarlo a un rango de celdas (A1:E2) como antes - eso tambien lo deformaba, ya que el rango no
    respeta el aspect ratio real de la imagen. 370x100px mantiene su proporcion real (~3.7:1) y cabe dentro
    del ancho de A:D (~375px via los anchos de columna de arriba) sin invadir la columna E, donde empieza
    "RESPONSABLE:".
    */
    try {
      const respLogo = await fetch('/logo-excel.png');
      const bufferLogo = await respLogo.arrayBuffer();
      const base64Logo = btoa(new Uint8Array(bufferLogo).reduce((s, b) => s + String.fromCharCode(b), ''));
      const idImagen = wb.addImage({ base64: base64Logo, extension: 'png' });
      ws.mergeCells('A1:D6');
      ws.addImage(idImagen, { tl: { col: 0, row: 0 }, ext: { width: 370, height: 100 } });
    } catch {
      // Si el logo no carga (ej. sin red), el Excel se genera igual, solo sin la imagen.
    }

    // Titulo
    ws.mergeCells('F1:O2');
    celda('F1', 'REGISTRO DE LABORES DIARIAS', { bold: true, size: 22 });

    // Encabezado: Responsable / Digitacion TTHH / Dia reportado / Semana / Area.
    celda('F3', 'RESPONSABLE:');
    ws.mergeCells('G3:J3'); celda('G3', nombreSupervisor);
    celda('K3', 'DIGITACION TTHH:');
    ws.mergeCells('L3:O3'); celda('L3', '');

    celda('F4', 'DIA REPORTADO:');
    ws.mergeCells('G4:J4'); celda('G4', diaSemana);

    celda('F5', 'SEMANA:');
    ws.mergeCells('G5:J5'); celda('G5', semana);

    celda('F6', 'AREA:');
    ws.mergeCells('G6:J6'); celda('G6', 'TALLER');

    // Encabezado de la tabla (fila 7).
    const ENCABEZADOS: [string, string, FillPattern | undefined][] = [
      ['A7', 'Nª', undefined],
      ['B7', 'Fecha', AMARILLO],
      ['C7', 'Cod.', AMARILLO],
      ['D7', 'Empleado', undefined],
      ['E7', 'Cod. Labor', AMARILLO],
      ['F7', 'Labor', undefined],
      ['G7', 'Seccion', AMARILLO],
      ['H7', 'Lote/AREA', undefined],
      ['I7', 'Cod Equipo&Implemento', AZUL_CLARO],
      ['J7', 'Descripcion Eq/Implem', AZUL_CLARO],
      ['K7', 'ETAPA DEL CULTIVO 1', AMARILLO],
      ['L7', 'ETAPA DEL CULTIVO 2', AMARILLO],
      ['M7', 'Rendimiento', AMARILLO],
      ['N7', 'Tarea/Hrs', AMARILLO],
      ['O7', 'OBSERVACION', AMARILLO],
    ];
    for (const [coord, texto, fill] of ENCABEZADOS) celda(coord, texto, { fill, bold: true });

    // Filas de datos: un bloque por trabajador, N° auto-incremental, A/B/C/D/O combinadas y centradas en
    // todo el bloque (pedido explicito del usuario - igual que en la plantilla real).
    let filaActual = 8;
    let numero = 1;
    for (const bloque of bloques) {
      const filaInicio = filaActual;
      const registros: (RegistroActividad | null)[] = bloque.registros.length > 0 ? bloque.registros : [null];

      for (const reg of registros) {
        const horas = reg?.hora_fin
          ? this.redondearHoras((new Date(reg.hora_fin).getTime() - new Date(reg.hora_inicio).getTime()) / 3600000)
          : '';
        celda(`E${filaActual}`, reg?.actividad?.codigo_megued || '');
        celda(`F${filaActual}`, reg?.actividad?.description || '');
        celda(`G${filaActual}`, 'AP06', { fill: AZUL_CLARO });
        celda(`H${filaActual}`, 'M&Reparacion');
        celda(`I${filaActual}`, reg?.equipo?.codigo_megued || '');
        celda(`J${filaActual}`, reg?.equipo?.nombre_equipo || '');
        celda(`K${filaActual}`, 'FIJOS DEL TALLER', { fill: VERDE_CLARO });
        celda(`L${filaActual}`, 'FIJOS DEL TALLER', { fill: VERDE_MEDIO });
        celda(`M${filaActual}`, '', { fill: MORADO_CLARO });
        celda(`N${filaActual}`, horas);
        filaActual++;
      }
      const filaFin = filaActual - 1;

      celda(`A${filaInicio}`, numero);
      celda(`B${filaInicio}`, new Date(`${fecha}T00:00:00Z`));
      ws.getCell(`B${filaInicio}`).numFmt = 'm/d/yy';
      celda(`C${filaInicio}`, bloque.operador.codigo_megued);
      celda(`D${filaInicio}`, bloque.operador.nombre_completo, { bold: true });
      celda(`O${filaInicio}`, ''); // Observacion: vacia a proposito, para que la editen despues.
      if (filaFin > filaInicio) {
        ws.mergeCells(`A${filaInicio}:A${filaFin}`);
        ws.mergeCells(`B${filaInicio}:B${filaFin}`);
        ws.mergeCells(`C${filaInicio}:C${filaFin}`);
        ws.mergeCells(`D${filaInicio}:D${filaFin}`);
        ws.mergeCells(`O${filaInicio}:O${filaFin}`);
      }
      numero++;
    }

    // Pie de firmas (igual que la plantilla real), dos filas despues de la ultima fila de datos.
    const filaFirma1 = filaActual + 1;
    const filaFirma2 = filaFirma1 + 1;
    ws.mergeCells(`A${filaFirma1}:D${filaFirma1}`); celda(`A${filaFirma1}`, 'FIRMA DEL RESPONSABLE', { bold: true });
    ws.mergeCells(`I${filaFirma1}:J${filaFirma1}`); celda(`I${filaFirma1}`, 'AUTORIZADO POR:', { bold: true });
    ws.mergeCells(`M${filaFirma1}:O${filaFirma1}`); celda(`M${filaFirma1}`, 'FIRMA DE TTHH', { bold: true });
    ws.mergeCells(`A${filaFirma2}:D${filaFirma2}`); celda(`A${filaFirma2}`, 'NOMBRE:');
    ws.mergeCells(`M${filaFirma2}:O${filaFirma2}`); celda(`M${filaFirma2}`, 'DIGITADO POR:');

    const buffer = await wb.xlsx.writeBuffer();
    const nombreArchivo = `TALLER ${nombreHacienda.toUpperCase()} ${fechaDDMMYYYY}.xlsx`;
    await this.descargarArchivo(buffer as ArrayBuffer, nombreArchivo);
  }

  /*
  Mismo patron que compartirHoja() (hoja-actividades-modal.ts)/imprimirQR(): dentro del WebView de la app
  empaquetada no hay dialogo de descarga del navegador, asi que se escribe el archivo a Cache y se comparte via
  el selector nativo de Android (ahi lo pueden guardar, mandarlo por WhatsApp/correo, etc). En navegador de
  escritorio, la descarga normal via un link temporal.
  */
  private async descargarArchivo(buffer: ArrayBuffer, nombreArchivo: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      const base64 = btoa(new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), ''));
      const escrito = await Filesystem.writeFile({ path: nombreArchivo, data: base64, directory: Directory.Cache });
      await Share.share({
        title: nombreArchivo,
        dialogTitle: 'Compartir o guardar Excel',
        files: [escrito.uri],
      });
      return;
    }
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombreArchivo;
    enlace.click();
    URL.revokeObjectURL(url);
  }

  // "Tarea/Hrs" redondeado a la media hora mas cercana (pedido explicito del usuario, con sus propios
  // ejemplos): 1h45min (1.75h) -> 2, 1h20min (1.33h) -> 1.5. Redondeo normal a la mitad mas cercana.
  private redondearHoras(horas: number): number {
    return Math.round(horas * 2) / 2;
  }

  // Numero de semana ISO 8601 (lunes=inicio de semana, la semana 1 es la que contiene el primer jueves del
  // año) - mismo criterio que Excel/la plantilla real (semana 40 para el 29 de septiembre de 2026).
  private numeroSemanaISO(fecha: Date): number {
    const d = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
    const diaIso = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - diaIso);
    const inicioAño = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - inicioAño.getTime()) / 86400000 + 1) / 7);
  }

  // Sin tildes a proposito - misma convencion que ya usa la plantilla real del usuario ("Seccion",
  // "Descripcion", "transmision", todos sin acento).
  private readonly DIAS_SEMANA_ES = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
}
