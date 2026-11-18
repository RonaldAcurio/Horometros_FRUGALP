import { TestBed } from '@angular/core/testing';
import { Workbook } from 'exceljs';
import { ExportarExcelService } from './exportar-excel.service';
import { Operador, RegistroActividad } from '../models/asistencia.model';

// Helper mínimo - a estos tests no les importa el nombre_completo real, solo que exista.
const operador = (id: number, nombreCompleto: string): Operador =>
  ({ id, codigo_megued: `OP-${id}`, nombre_completo: nombreCompleto, rol: 'OPERADOR' }) as Operador;

describe('ExportarExcelService', () => {
  let service: ExportarExcelService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ExportarExcelService);
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  // nombreDeHojaUnico (pedido del usuario, 2026-10-23): Excel exige nombres de hoja de maximo 31
  // caracteres, sin \ / * ? : [ ], y unicos dentro del workbook - nombreHacienda puede no cumplir nada de eso.
  describe('nombreDeHojaUnico', () => {
    const llamar = (nombre: string, usados = new Set<string>()) =>
      (service as unknown as { nombreDeHojaUnico(n: string, u: Set<string>): string }).nombreDeHojaUnico(nombre, usados);

    it('reemplaza los caracteres invalidos de Excel por espacios', () => {
      expect(llamar('Hacienda/Prueba:1[2]')).toBe('Hacienda Prueba 1 2');
    });

    it('recorta a 31 caracteres', () => {
      const nombreLargo = 'Hacienda con un nombre demasiado largo para una sola hoja de Excel';
      const resultado = llamar(nombreLargo);
      expect(resultado.length).toBeLessThanOrEqual(31);
      expect(resultado).toBe(nombreLargo.slice(0, 31));
    });

    it('cae a "Hacienda" si el nombre queda vacío tras sanear', () => {
      expect(llamar('   ')).toBe('Hacienda');
      expect(llamar('///')).toBe('Hacienda');
    });

    it('desambigua nombres repetidos agregando "(2)", "(3)", etc', () => {
      const usados = new Set<string>();
      expect(llamar('Hacienda A', usados)).toBe('Hacienda A');
      expect(llamar('Hacienda A', usados)).toBe('Hacienda A (2)');
      expect(llamar('Hacienda A', usados)).toBe('Hacienda A (3)');
    });

    it('la desambiguación no distingue mayúsculas/minúsculas', () => {
      const usados = new Set<string>();
      llamar('Hacienda A', usados);
      expect(llamar('HACIENDA A', usados)).toBe('HACIENDA A (2)');
    });
  });

  // generarYDescargarTodasLasHaciendas (pedido del usuario, 2026-10-23): un solo archivo con una hoja por
  // hacienda, en orden alfabético - no en el orden en que llegaron agrupadas desde asistencia-panel.ts.
  describe('generarYDescargarTodasLasHaciendas', () => {
    let construirHojaHaciendaSpy: ReturnType<typeof vi.spyOn>;
    let descargarArchivoSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      // Sin red en el entorno de pruebas - cargarLogo ya maneja esto por su cuenta (try/catch -> undefined),
      // pero se evita el intento real de fetch para que el test no dependa de temporizadores/red.
      vi.spyOn(service as unknown as { cargarLogo(): Promise<undefined> }, 'cargarLogo').mockResolvedValue(undefined);
      // construirHojaHacienda corre de verdad (arma el Workbook real con ExcelJS) - solo se observa el
      // nombre de hoja con el que se la llamó, en qué orden.
      construirHojaHaciendaSpy = vi.spyOn(
        service as unknown as { construirHojaHacienda(...a: unknown[]): void },
        'construirHojaHacienda',
      );
      // descargarArchivo usa Blob/URL.createObjectURL/un <a> de descarga - no es lo que estos tests
      // verifican (eso lo prueba la verificación en vivo), así que se intercepta para solo leer el
      // nombre de archivo final.
      descargarArchivoSpy = vi.spyOn(
        service as unknown as { descargarArchivo(b: ArrayBuffer, n: string): Promise<void> },
        'descargarArchivo',
      ).mockResolvedValue(undefined);
    });

    it('arma las hojas en orden alfabético por nombre de hacienda, no en el orden recibido', async () => {
      await service.generarYDescargarTodasLasHaciendas(
        [
          { nombreHacienda: 'Zapote', nombreSupervisor: 'Sup Z', bloques: [{ operador: operador(1, 'A'), registros: [] }] },
          { nombreHacienda: 'Andes', nombreSupervisor: 'Sup A', bloques: [{ operador: operador(2, 'B'), registros: [] }] },
          { nombreHacienda: 'Meseta', nombreSupervisor: 'Sup M', bloques: [{ operador: operador(3, 'C'), registros: [] }] },
        ],
        '2026-10-23',
      );

      const nombresDeHojaEnOrden = construirHojaHaciendaSpy.mock.calls.map((llamada: unknown[]) => llamada[1]);
      expect(nombresDeHojaEnOrden).toEqual(['Andes', 'Meseta', 'Zapote']);
    });

    it('descarga el archivo combinado con nombre genérico "TALLER TODOS {fecha}.xlsx"', async () => {
      await service.generarYDescargarTodasLasHaciendas(
        [{ nombreHacienda: 'Andes', nombreSupervisor: 'Sup A', bloques: [] }],
        '2026-10-23',
      );

      expect(descargarArchivoSpy).toHaveBeenCalledWith(expect.anything(), 'TALLER TODOS 23102026.xlsx');
    });
  });

  // pageSetup (pedido del usuario, 2026-11-06, con foto de referencia): antes se imprimia en vertical sin
  // ajustar, dejando la tabla apretada en una franja angosta con margenes enormes sin usar. Horizontal +
  // "ajustar a 1 pagina" (ancho y alto) es lo que hace que Excel/LibreOffice calculen la escala necesaria
  // para que las 15 columnas y todas las filas entren en una sola hoja impresa.
  describe('pageSetup de impresión (construirHojaHacienda)', () => {
    const construir = (bloques: { operador: Operador; registros: never[] }[]) => {
      const wb = new Workbook();
      (service as unknown as {
        construirHojaHacienda(
          wb: Workbook, nombreHoja: string, idImagen: number | undefined,
          bloques: { operador: Operador; registros: never[] }[], fecha: string, nombreSupervisor: string,
        ): void;
      }).construirHojaHacienda(wb, 'Hoja1', undefined, bloques, '2026-10-23', 'Sup A');
      return wb.getWorksheet('Hoja1')!;
    };

    it('queda horizontal y ajustada a una sola hoja (ancho y alto)', () => {
      const ws = construir([{ operador: operador(1, 'A'), registros: [] }]);
      expect(ws.pageSetup.orientation).toBe('landscape');
      expect(ws.pageSetup.fitToPage).toBe(true);
      expect(ws.pageSetup.fitToWidth).toBe(1);
      expect(ws.pageSetup.fitToHeight).toBe(1);
      expect(ws.pageSetup.horizontalCentered).toBe(true);
    });

    it('usa márgenes mínimos para aprovechar toda la página', () => {
      const ws = construir([{ operador: operador(1, 'A'), registros: [] }]);
      expect(ws.pageSetup.margins).toEqual({ left: 0.2, right: 0.2, top: 0.2, bottom: 0.2, header: 0, footer: 0 });
    });

    it('el área de impresión cubre A1 hasta la última fila usada (pie de firmas), sin filas vacías de más', () => {
      // Un solo bloque (1 trabajador, sin registros) -> fila 8 de datos, firmas en 10/11.
      const ws = construir([{ operador: operador(1, 'A'), registros: [] }]);
      expect(ws.pageSetup.printArea).toBe('A1:O11');
    });
  });

  /*
  Lo que SI es un número se guarda como número real (corrección, pedido del usuario, 2026-11-18, revirtiendo
  el "todo como texto" del 2026-11-16 - eso hacía que Excel marcara con el triángulo de advertencia "número
  guardado como texto" cualquier código/hora puramente numérico, y rompía el orden numérico al ordenar). Un
  código con letras (ej. "OP-1") sigue siendo texto - nunca se fuerza a número si no lo es de verdad.
  */
  describe('formato de celdas (construirHojaHacienda): números reales donde corresponde', () => {
    const construir = (bloques: { operador: Operador; registros: RegistroActividad[] }[]) => {
      const wb = new Workbook();
      (service as unknown as {
        construirHojaHacienda(
          wb: Workbook, nombreHoja: string, idImagen: number | undefined,
          bloques: { operador: Operador; registros: RegistroActividad[] }[], fecha: string, nombreSupervisor: string,
        ): void;
      }).construirHojaHacienda(wb, 'Hoja1', undefined, bloques, '2026-10-23', 'Sup A');
      return wb.getWorksheet('Hoja1')!;
    };

    const registro = (horaInicio: string, horaFin: string | null): RegistroActividad => ({
      id: 1, asistencia_id: 1, equipo_id: 1, actividad_id: 1, hora_inicio: horaInicio, hora_fin: horaFin,
    });

    it('Nª (A) es un número real, y ordena numéricamente (1, 2 ... 10, no 1, 10, 2)', () => {
      const ws = construir([{ operador: operador(1, 'A'), registros: [] }]);
      expect(ws.getCell('A8').value).toBe(1);
      expect(typeof ws.getCell('A8').value).toBe('number');
    });

    it('Fecha (B) sigue siendo una fecha real de Excel con formato dd/mm/yyyy', () => {
      const ws = construir([{ operador: operador(1, 'A'), registros: [] }]);
      expect(ws.getCell('B8').value).toEqual(new Date('2026-10-23T00:00:00Z'));
      expect(ws.getCell('B8').numFmt).toBe('dd/mm/yyyy');
    });

    it('Cod. (C) puramente numérico se guarda como número, no como texto', () => {
      const operadorCodigoNumerico = { ...operador(1, 'A'), codigo_megued: '2005' };
      const ws = construir([{ operador: operadorCodigoNumerico, registros: [] }]);
      expect(ws.getCell('C8').value).toBe(2005);
      expect(typeof ws.getCell('C8').value).toBe('number');
    });

    it('Cod. (C) con letras se queda como texto (no se fuerza a número)', () => {
      const ws = construir([{ operador: operador(1, 'A'), registros: [] }]); // codigo_megued: 'OP-1'
      expect(ws.getCell('C8').value).toBe('OP-1');
      expect(typeof ws.getCell('C8').value).toBe('string');
    });

    it('Tarea/Hrs (N) es un número real cuando SI hay horas calculadas', () => {
      const ws = construir([{
        operador: operador(1, 'A'),
        registros: [registro('2026-10-23T08:00:00.000Z', '2026-10-23T09:30:00.000Z')],
      }]);
      expect(ws.getCell('N8').value).toBe(1.5); // 1h30min redondeado a la media hora mas cercana.
      expect(typeof ws.getCell('N8').value).toBe('number');
    });

    it('Tarea/Hrs (N) queda vacía (no texto vacío) cuando NO hay horas', () => {
      const ws = construir([{
        operador: operador(1, 'A'),
        registros: [registro('2026-10-23T08:00:00.000Z', null)],
      }]);
      expect(ws.getCell('N8').value).toBeFalsy();
      expect(typeof ws.getCell('N8').value).not.toBe('number');
    });
  });
});
