import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { SupervisorPanel } from './supervisor-panel';
import { Asistencia, Operador } from '../../../../core/models/asistencia.model';

describe('SupervisorPanel', () => {
  let component: SupervisorPanel;
  let fixture: ComponentFixture<SupervisorPanel>;
  let httpMock: HttpTestingController;

  // Drena cualquier petición pendiente con una respuesta vacía del formato correcto según el endpoint -
  // /hoy devuelve {data, total, ...}, /operadores (sin pagina/limite, como la del roster completo) devuelve
  // un array plano, igual que /equipos y /actividad.
  const drenarPendientes = () => {
    httpMock.match(() => true).forEach((req) => {
      if (req.request.url.includes('/hoy')) {
        req.flush({ data: [], total: 0, pagina: 1, totalPaginas: 1, diaCerrado: false });
      } else {
        req.flush([]);
      }
    });
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SupervisorPanel],
      // RouterLink en la plantilla + varios servicios inyectados que usan HttpClient
      // (AsistenciaService, HaciendaService, UsuarioService) necesitan ambos providers.
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(SupervisorPanel);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    await fixture.whenStable();

    // ngOnInit ya dispara varias cargas iniciales (asistencias de hoy, roster completo para el nuevo diff de
    // "trabajadoresSinMarcar", hacienda propia, catálogos de los modales hijos) - se descartan aquí para que
    // cada test empiece desde cero y dispare sus propias peticiones a propósito.
    drenarPendientes();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Roster completo (pedido del usuario, 2026-10-27): aparte de la tabla paginada de asistencias reales de
  // hoy, se arma la lista de quién de toda la hacienda TODAVÍA no tiene ninguna asistencia ese día.
  describe('cargarTrabajadoresSinMarcar (vía cargarAsistencias)', () => {
    const operadorConAsistencia: Operador = { id: 1, codigo_megued: 'OP-1', nombre_completo: 'Ya Marcó' };
    const operadorSinAsistencia: Operador = { id: 2, codigo_megued: 'OP-2', nombre_completo: 'No Marcó' };

    it('arma trabajadoresSinMarcar con el roster completo menos quien ya tiene asistencia ese día', () => {
      (component as any).cargarAsistencias();

      // La tabla paginada de arriba (30 por página).
      const peticionAsistenciasPaginada = httpMock.expectOne((r) => r.url.includes('/hoy') && r.urlWithParams.includes('limite=30'));
      peticionAsistenciasPaginada.flush({ data: [], total: 0, pagina: 1, totalPaginas: 1, diaCerrado: false });

      // El roster completo (sin pagina/limite) y las asistencias del día con límite alto, para el diff.
      const peticionRoster = httpMock.expectOne((r) => r.url.includes('/operadores') && !r.urlWithParams.includes('pagina'));
      const peticionAsistenciasCompleto = httpMock.expectOne((r) => r.url.includes('/hoy') && r.urlWithParams.includes('limite=100'));

      peticionRoster.flush([operadorConAsistencia, operadorSinAsistencia]);
      peticionAsistenciasCompleto.flush({
        data: [{ id: 10, operador_id: 1, fecha: '2026-10-27', estado: 'EN_JORNADA' } as Asistencia],
        total: 1, pagina: 1, totalPaginas: 1, diaCerrado: false,
      });

      expect(component.trabajadoresSinMarcar).toEqual([operadorSinAsistencia]);
    });
  });

  // Marcar ausente desde el roster completo (pedido del usuario, 2026-10-27).
  describe('abrirMarcarAusente / onOperadorAgregado', () => {
    const operador: Operador = { id: 5, codigo_megued: 'OP-5', nombre_completo: 'Sin Marcar' };

    beforeEach(() => {
      // ViewChild - no se inicializa sin detectChanges()/view init completo, se reemplaza por un stub.
      (component as any).agregarUsuarioModal = { abrir: vi.fn() };
      (component as any).panelLaboresModal = { abrir: vi.fn() };
    });

    it('abrirMarcarAusente abre el modal "Agregar Usuario" con ese operador fijo', () => {
      component.fechaSeleccionada = '2026-10-20';

      component.abrirMarcarAusente(operador);

      expect((component as any).agregarUsuarioModal.abrir).toHaveBeenCalledWith({
        supervisorId: undefined,
        fecha: '2026-10-20',
        operadorFijo: operador,
      });
    });

    it('onOperadorAgregado desde el flujo de marcar ausente abre el PanelLaboresModal sobre la Asistencia creada', () => {
      component.abrirMarcarAusente(operador);
      const asistenciaCreada = { id: 50, operador_id: 5, fecha: '2026-10-20', estado: 'EN_JORNADA' } as Asistencia;

      component.onOperadorAgregado(asistenciaCreada);

      // cargarAsistencias() dispara sus propias peticiones - se descartan, no son el foco de este test.
      drenarPendientes();

      expect((component as any).panelLaboresModal.abrir).toHaveBeenCalledWith(asistenciaCreada);
    });

    it('onOperadorAgregado desde el flujo normal de "+ Agregar Usuario" NO abre el PanelLaboresModal', () => {
      component.abrirAgregarUsuario();
      const asistenciaCreada = { id: 51, operador_id: 9, fecha: '2026-10-27', estado: 'EN_JORNADA' } as Asistencia;

      component.onOperadorAgregado(asistenciaCreada);
      drenarPendientes();

      expect((component as any).panelLaboresModal.abrir).not.toHaveBeenCalled();
    });
  });

  afterEach(() => httpMock.verify());
});
