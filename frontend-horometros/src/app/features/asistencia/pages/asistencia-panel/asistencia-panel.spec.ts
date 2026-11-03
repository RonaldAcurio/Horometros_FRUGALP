import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import * as XLSX from '@e965/xlsx';
import { AsistenciaPanel } from './asistencia-panel';
import { Asistencia, Operador } from '../../../../core/models/asistencia.model';
import { ExportarExcelService } from '../../../../core/services/exportar-excel.service';

describe('AsistenciaPanel', () => {
  let component: AsistenciaPanel;
  let fixture: ComponentFixture<AsistenciaPanel>;
  let httpMock: HttpTestingController;
  let exportarExcelService: ExportarExcelService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AsistenciaPanel],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(AsistenciaPanel);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    exportarExcelService = TestBed.inject(ExportarExcelService);
    await fixture.whenStable();

    // ngOnInit ya dispara estas 3 cargas iniciales (operadores/supervisores/haciendas) - se descartan aquí
    // para que cada test empiece desde cero y pueda armar sus propios this.haciendas/this.supervisores.
    httpMock.expectOne((r) => r.urlWithParams.includes('/operadores')).flush({ data: [], total: 0, totalPaginas: 1 });
    httpMock.expectOne((r) => r.url.endsWith('/usuarios')).flush([]);
    httpMock.expectOne((r) => r.url.endsWith('/haciendas')).flush([]);
  });

  afterEach(() => httpMock.verify());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  /*
  "Exportar a Excel" sin elegir Hacienda/Supervisor (pedido del usuario, 2026-10-23): dejarlos en
  "Todos"/"Todas" (haciendaIdFiltro/supervisorIdFiltro en null) ya no debe deshabilitar el botón - solo
  el mismo día en Desde/Hasta sigue siendo obligatorio.
  */
  describe('puedeExportarExcel', () => {
    it('ya no exige Hacienda ni Supervisor puntuales, solo el mismo día', () => {
      component.fechaInicioFiltro = '2026-10-23';
      component.fechaFinFiltro = '2026-10-23';
      component.haciendaIdFiltro = null;
      component.supervisorIdFiltro = null;

      expect(component.puedeExportarExcel).toBe(true);
    });

    it('sigue exigiendo el mismo día en Desde/Hasta', () => {
      component.fechaInicioFiltro = '2026-10-20';
      component.fechaFinFiltro = '2026-10-23';

      expect(component.puedeExportarExcel).toBe(false);
    });
  });

  // Filtro por Supervisor del Directorio de Operadores (pedido del usuario, 2026-11-02): separado del
  // supervisorIdFiltro del Historial (ver describe de arriba) - no debe interferir entre pestañas.
  describe('Directorio: filtro por Supervisor', () => {
    it('onCambioSupervisorDirectorio() vuelve a la página 1 y manda supervisor_id al backend', () => {
      component.supervisorIdFiltroDirectorio = 42;
      component.paginaActual = 3;

      component.onCambioSupervisorDirectorio();

      expect(component.paginaActual).toBe(1);
      const peticion = httpMock.expectOne((r) => r.urlWithParams.includes('/operadores') && r.urlWithParams.includes('pagina=1'));
      expect(peticion.request.urlWithParams).toContain('supervisor_id=42');
      peticion.flush({ data: [], total: 0, pagina: 1, totalPaginas: 1 });
    });

    it('en "Todos" (null) no manda supervisor_id', () => {
      component.supervisorIdFiltroDirectorio = null;

      component.cargarOperadores();

      const peticion = httpMock.expectOne((r) => r.urlWithParams.includes('/operadores'));
      expect(peticion.request.urlWithParams).not.toContain('supervisor_id');
      peticion.flush({ data: [], total: 0, pagina: 1, totalPaginas: 1 });
    });
  });

  // Plantilla de Operadores con columna Área (pedido del usuario, 2026-11-02): mismo endpoint que la
  // plantilla general, pero con encabezados distintos ("Nombre Empleado", "Jefe Inmediato", "Area Que
  // Pertenece") - onArchivoOperadoresSeleccionado tiene que reconocerlos igual que a los de siempre.
  describe('Importar Operadores: plantilla con columna Área', () => {
    const archivoDesdeFilas = (encabezados: string[], fila: string[]): File => {
      const hoja = XLSX.utils.aoa_to_sheet([encabezados, fila]);
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, hoja, 'Operadores');
      const buffer = XLSX.write(libro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
      return new File([buffer], 'plantilla-operadores.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    };

    const dispararSeleccion = async (archivo: File): Promise<void> => {
      const input = document.createElement('input');
      input.type = 'file';
      Object.defineProperty(input, 'files', { value: [archivo] });
      await component.onArchivoOperadoresSeleccionado({ target: input } as unknown as Event);
    };

    it('reconoce Nombre Empleado/Jefe Inmediato/Area Que Pertenece y los manda ya mapeados', async () => {
      const archivo = archivoDesdeFilas(
        ['Codigo', 'Cedula', 'Nombre Empleado', 'Cargo', 'Jefe Inmediato', 'Area Que Pertenece'],
        ['OP-001', '0102030405', 'Carlos Ruiz', 'OPERADOR', 'Sup Andes', 'EMPACADORA'],
      );

      await dispararSeleccion(archivo);

      expect(component.filasParaImportarOperador).toEqual([
        { codigo_megued: 'OP-001', cedula: '0102030405', nombre_completo: 'Carlos Ruiz', rol: 'OPERADOR', supervisor: 'Sup Andes', area: 'EMPACADORA' },
      ]);
    });

    it('la plantilla general (sin columna Área) sigue funcionando - area queda vacía', async () => {
      const archivo = archivoDesdeFilas(
        ['NOMBRE', 'CARGO', 'CODIGO', 'CEDULA', 'SUPERVISOR'],
        ['Juan Perez', 'MECANICO', 'MEC-001', '0102030405', 'Sup Andes'],
      );

      await dispararSeleccion(archivo);

      expect(component.filasParaImportarOperador).toEqual([
        { nombre_completo: 'Juan Perez', rol: 'MECANICO', codigo_megued: 'MEC-001', cedula: '0102030405', supervisor: 'Sup Andes', area: '' },
      ]);
    });
  });

  describe('exportarExcelDiario() con Hacienda/Supervisor en "Todos" (todas las haciendas)', () => {
    const operadorDeAndes: Operador = {
      id: 1, codigo_megued: 'OP-1', nombre_completo: 'Trabajador Andes',
      supervisor: { hacienda_id: 10, hacienda: { nombre: 'Andes' } },
    };
    const operadorDeZapote: Operador = {
      id: 2, codigo_megued: 'OP-2', nombre_completo: 'Trabajador Zapote',
      supervisor: { hacienda_id: 20, hacienda: { nombre: 'Zapote' } },
    };
    // Marcado OBSERVANDO (el Supervisor dijo "no vino") - YA debe aparecer en el Excel, marcado como
    // ausente, igual que en el camino de una sola hacienda (pedido del usuario, 2026-10-27).
    const operadorObservando: Operador = {
      id: 3, codigo_megued: 'OP-3', nombre_completo: 'No Vino',
      supervisor: { hacienda_id: 10, hacienda: { nombre: 'Andes' } },
    };

    const registroDe = (operador: Operador, estado: Asistencia['estado'] = 'FINALIZADO'): Asistencia =>
      ({ id: operador.id, operador_id: operador.id, fecha: '2026-10-23', hora_ingreso: '2026-10-23T07:00:00.000Z', estado, operador }) as Asistencia;

    beforeEach(() => {
      component.fechaInicioFiltro = '2026-10-23';
      component.fechaFinFiltro = '2026-10-23';
      component.haciendaIdFiltro = null;
      component.supervisorIdFiltro = null;
      component.haciendas = [
        { id: 10, nombre: 'Andes', token_actual: null, token_expira_en: null },
        { id: 20, nombre: 'Zapote', token_actual: null, token_expira_en: null },
      ];
      component.supervisores = [
        { id: 100, nombre_completo: 'Sup Andes', usuario: 'sup.andes', cargo: 'SUPERVISOR', activo: true, hacienda_id: 10 },
        { id: 200, nombre_completo: 'Sup Zapote', usuario: 'sup.zapote', cargo: 'SUPERVISOR', activo: true, hacienda_id: 20 },
      ];
    });

    it('agrupa por hacienda, incluye también a los marcados OBSERVANDO, y llama a generarYDescargarTodasLasHaciendas', async () => {
      const generarSpy = vi.spyOn(exportarExcelService, 'generarYDescargarTodasLasHaciendas').mockResolvedValue(undefined);

      component.exportarExcelDiario();

      const peticionHistorial = httpMock.expectOne(
        (r) => r.urlWithParams.includes('/historial') && !r.urlWithParams.includes('hacienda_id') && !r.urlWithParams.includes('supervisor_id'),
      );
      peticionHistorial.flush({
        data: [registroDe(operadorDeAndes), registroDe(operadorDeZapote), registroDe(operadorObservando, 'OBSERVANDO')],
        total: 3, pagina: 1, totalPaginas: 1,
      });

      httpMock.expectOne((r) => r.urlWithParams.includes('por-operador') && r.urlWithParams.includes('operador_id=1')).flush([]);
      httpMock.expectOne((r) => r.urlWithParams.includes('por-operador') && r.urlWithParams.includes('operador_id=2')).flush([]);
      httpMock.expectOne((r) => r.urlWithParams.includes('por-operador') && r.urlWithParams.includes('operador_id=3')).flush([]);

      await fixture.whenStable();

      expect(generarSpy).toHaveBeenCalledTimes(1);
      const [porHacienda, fecha] = generarSpy.mock.calls[0];
      expect(fecha).toBe('2026-10-23');
      expect(porHacienda).toHaveLength(2);

      const grupoAndes = porHacienda.find((g) => g.nombreHacienda === 'Andes');
      expect(grupoAndes?.nombreSupervisor).toBe('Sup Andes');
      expect(grupoAndes?.bloques.map((b) => b.operador.id)).toEqual([1, 3]); // operadorObservando SÍ entra.

      const grupoZapote = porHacienda.find((g) => g.nombreHacienda === 'Zapote');
      expect(grupoZapote?.nombreSupervisor).toBe('Sup Zapote');
      expect(grupoZapote?.bloques.map((b) => b.operador.id)).toEqual([2]);
    });

    it('pide TODAS las páginas del Historial antes de agrupar (no se queda solo con la primera)', async () => {
      const generarSpy = vi.spyOn(exportarExcelService, 'generarYDescargarTodasLasHaciendas').mockResolvedValue(undefined);

      component.exportarExcelDiario();

      const primeraPagina = httpMock.expectOne((r) => r.urlWithParams.includes('/historial') && r.urlWithParams.includes('pagina=1'));
      primeraPagina.flush({ data: [registroDe(operadorDeAndes)], total: 2, pagina: 1, totalPaginas: 2 });

      const segundaPagina = httpMock.expectOne((r) => r.urlWithParams.includes('/historial') && r.urlWithParams.includes('pagina=2'));
      segundaPagina.flush({ data: [registroDe(operadorDeZapote)], total: 2, pagina: 2, totalPaginas: 2 });

      httpMock.expectOne((r) => r.urlWithParams.includes('por-operador') && r.urlWithParams.includes('operador_id=1')).flush([]);
      httpMock.expectOne((r) => r.urlWithParams.includes('por-operador') && r.urlWithParams.includes('operador_id=2')).flush([]);

      await fixture.whenStable();

      expect(generarSpy).toHaveBeenCalledTimes(1);
      expect(generarSpy.mock.calls[0][0]).toHaveLength(2);
    });
  });
});
