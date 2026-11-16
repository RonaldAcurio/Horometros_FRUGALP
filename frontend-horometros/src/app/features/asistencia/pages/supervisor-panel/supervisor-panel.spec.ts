import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { SupervisorPanel } from './supervisor-panel';
import { Asistencia, FilaAsistenciaOPendiente, Operador } from '../../../../core/models/asistencia.model';
import { OfflineSyncService } from '../../../../core/services/offline-sync.service';
import { NotificacionService } from '../../../../core/services/notificacion.service';

describe('SupervisorPanel', () => {
  let component: SupervisorPanel;
  let fixture: ComponentFixture<SupervisorPanel>;
  let httpMock: HttpTestingController;

  // Drena cualquier petición pendiente con una respuesta vacía del formato correcto según el endpoint -
  // /hoy devuelve {data, total, ...}, el resto (equipos/actividad de los modales hijos) un array plano.
  const drenarPendientes = () => {
    httpMock.match(() => true).forEach((req) => {
      if (req.request.url.includes('/hoy')) {
        req.flush({ data: [], total: 0, pagina: 1, totalPaginas: 1, diaCerrado: false, totalPendientes: 0 });
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

    // ngOnInit ya dispara la carga inicial (asistencias+pendientes fusionadas de hoy, hacienda propia,
    // catálogos de los modales hijos) - se descarta aquí para que cada test empiece desde cero y dispare
    // sus propias peticiones a propósito.
    drenarPendientes();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Tabla única fusionada (pedido del usuario, 2026-11-16): cargarAsistencias ya no arma un roster aparte -
  // pide directamente la lista fusionada (reales + pendientes) con incluir_pendientes=true.
  describe('cargarAsistencias (tabla fusionada)', () => {
    const filaReal = { id: 10, operador_id: 1, fecha: '2026-11-16', estado: 'EN_JORNADA', pendiente: false } as FilaAsistenciaOPendiente;
    const filaPendiente: FilaAsistenciaOPendiente = {
      pendiente: true, operador_id: 2,
      operador: { id: 2, codigo_megued: 'OP-2', nombre_completo: 'No Marcó' },
    };

    it('pide incluir_pendientes=true y arma filasHoy con la mezcla real+pendiente que devuelve el backend', () => {
      (component as any).cargarAsistencias();

      const peticion = httpMock.expectOne((r) => r.url.includes('/hoy') && r.urlWithParams.includes('limite=30'));
      expect(peticion.request.urlWithParams).toContain('incluir_pendientes=true');
      peticion.flush({ data: [filaPendiente, filaReal], total: 2, pagina: 1, totalPaginas: 1, diaCerrado: false, totalPendientes: 1 });

      expect(component.filasHoy).toEqual([filaPendiente, filaReal]);
      expect(component.totalPendientes).toBe(1);
      expect(component.hayPendientes).toBe(true);
    });

    it('filasRealesHoy filtra solo las filas con pendiente:false', () => {
      (component as any).cargarAsistencias();
      const peticion = httpMock.expectOne((r) => r.url.includes('/hoy') && r.urlWithParams.includes('limite=30'));
      peticion.flush({ data: [filaPendiente, filaReal], total: 2, pagina: 1, totalPaginas: 1, diaCerrado: false, totalPendientes: 1 });

      expect(component.filasRealesHoy).toEqual([filaReal]);
    });
  });

  // "Cerrar Jornada" exige conexión y que no falten pendientes (pedido del usuario, 2026-11-16) - ambos
  // guards cortan ANTES del diálogo de confirmación, así que no hace falta mockearlo para probarlos.
  describe('ejecutarCierreDiario: guards nuevos', () => {
    it('no deja cerrar (ni llama al backend) si hayPendientes, y avisa cuántos faltan', async () => {
      component.totalPendientes = 3;
      const notificacionService = TestBed.inject(NotificacionService);
      const spy = vi.spyOn(notificacionService, 'advertencia');

      await component.ejecutarCierreDiario();

      expect(spy).toHaveBeenCalledWith(expect.stringContaining('3'));
      httpMock.expectNone((r) => r.url.includes('/finalizar-dia'));
    });

    it('no deja cerrar si no hay conexión', async () => {
      component.totalPendientes = 0;
      const offlineSyncService = TestBed.inject(OfflineSyncService);
      offlineSyncService.conectado.set(false);
      const notificacionService = TestBed.inject(NotificacionService);
      const spy = vi.spyOn(notificacionService, 'advertencia');

      await component.ejecutarCierreDiario();

      expect(spy).toHaveBeenCalledWith(expect.stringContaining('conexión'));
      httpMock.expectNone((r) => r.url.includes('/finalizar-dia'));
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
