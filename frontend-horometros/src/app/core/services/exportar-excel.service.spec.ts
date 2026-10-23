import { TestBed } from '@angular/core/testing';
import { ExportarExcelService } from './exportar-excel.service';
import { Operador } from '../models/asistencia.model';

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
});
