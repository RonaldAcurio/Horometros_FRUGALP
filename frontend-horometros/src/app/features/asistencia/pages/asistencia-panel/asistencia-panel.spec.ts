import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
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

  describe('exportarExcelDiario() con Hacienda/Supervisor en "Todos" (todas las haciendas)', () => {
    const operadorDeAndes: Operador = {
      id: 1, codigo_megued: 'OP-1', nombre_completo: 'Trabajador Andes',
      supervisor: { hacienda_id: 10, hacienda: { nombre: 'Andes' } },
    };
    const operadorDeZapote: Operador = {
      id: 2, codigo_megued: 'OP-2', nombre_completo: 'Trabajador Zapote',
      supervisor: { hacienda_id: 20, hacienda: { nombre: 'Zapote' } },
    };
    // Marcado OBSERVANDO (el Supervisor dijo "no vino") - el Excel es el reporte OFICIAL de horas
    // trabajadas, así que debe quedar afuera, igual que en el camino de una sola hacienda.
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

    it('agrupa por hacienda, descarta OBSERVANDO, y llama a generarYDescargarTodasLasHaciendas', async () => {
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

      await fixture.whenStable();

      expect(generarSpy).toHaveBeenCalledTimes(1);
      const [porHacienda, fecha] = generarSpy.mock.calls[0];
      expect(fecha).toBe('2026-10-23');
      expect(porHacienda).toHaveLength(2);

      const grupoAndes = porHacienda.find((g) => g.nombreHacienda === 'Andes');
      expect(grupoAndes?.nombreSupervisor).toBe('Sup Andes');
      expect(grupoAndes?.bloques.map((b) => b.operador.id)).toEqual([1]); // operadorObservando no entra.

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
