import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { PanelLaboresModal } from './panel-labores-modal';
import { Asistencia, RegistroActividad } from '../../../../core/models/asistencia.model';
import { ConfirmacionService } from '../../../../core/services/confirmacion.service';

describe('PanelLaboresModal', () => {
  let component: PanelLaboresModal;
  let fixture: ComponentFixture<PanelLaboresModal>;
  let httpMock: HttpTestingController;
  let confirmacionService: ConfirmacionService;

  const asistenciaDePrueba: Asistencia = {
    id: 42,
    operador_id: 7,
    fecha: '2026-10-20',
    hora_ingreso: '2026-10-20T07:00:00.000Z',
    estado: 'EN_JORNADA',
    operador: { id: 7, codigo_megued: 'OP-7', nombre_completo: 'Trabajador de Prueba', rol: 'OPERADOR' },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PanelLaboresModal],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(PanelLaboresModal);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    confirmacionService = TestBed.inject(ConfirmacionService);
    await fixture.whenStable();
  });

  afterEach(() => httpMock.verify());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('arranca cerrado, y abrir() lo muestra y carga catálogos + registros de ESA asistencia', () => {
    expect(component.visible).toBe(false);

    component.abrir(asistenciaDePrueba);

    expect(component.visible).toBe(true);
    expect(component.asistencia).toEqual(asistenciaDePrueba);
    // OPERADOR -> no es mecánico (ver mi-jornada.ts: esMecanico = rol !== 'OPERADOR').
    expect(component.esMecanico).toBe(false);

    const peticionRegistros = httpMock.expectOne((r) => r.urlWithParams.includes('registro-actividades') && r.urlWithParams.includes('asistencia_id=42'));
    peticionRegistros.flush([]);
    httpMock.expectOne((r) => r.urlWithParams.includes('/equipos')).flush([]);
    httpMock.expectOne((r) => r.urlWithParams.includes('/actividad')).flush([]);

    expect(component.registros).toEqual([]);
    expect(component.cargandoRegistros).toBe(false);
  });

  it('cerrar() limpia el estado para la próxima apertura', () => {
    component.abrir(asistenciaDePrueba);
    httpMock.expectOne((r) => r.urlWithParams.includes('registro-actividades')).flush([]);
    httpMock.expectOne((r) => r.urlWithParams.includes('/equipos')).flush([]);
    httpMock.expectOne((r) => r.urlWithParams.includes('/actividad')).flush([]);

    component.cerrar();

    expect(component.visible).toBe(false);
    expect(component.asistencia).toBeNull();
    expect(component.registros).toEqual([]);
  });

  it('esUltimaActividad: solo la última fila de la lista (ya viene ordenada por el backend)', () => {
    (component as any).registros = [
      { id: 1, hora_inicio: '2026-10-20T07:00:00.000Z' },
      { id: 2, hora_inicio: '2026-10-20T09:00:00.000Z' },
    ];
    expect(component.esUltimaActividad({ id: 1 } as any)).toBe(false);
    expect(component.esUltimaActividad({ id: 2 } as any)).toBe(true);
  });

  it('ultimaLaborSigueAbierta: true solo si la última fila no tiene hora_fin', () => {
    (component as any).registros = [{ id: 1, hora_fin: null }];
    expect(component.ultimaLaborSigueAbierta).toBe(true);

    (component as any).registros = [{ id: 1, hora_fin: '2026-10-20T08:00:00.000Z' }];
    expect(component.ultimaLaborSigueAbierta).toBe(false);
  });

  /*
  Ampliaciones del Panel de Supervisor (pedido del usuario, 2026-10-21): "Forzar eliminar" (siempre visible,
  junto al "Eliminar" normal) y editar hora_inicio/hora_fin juntas - a diferencia de mi-jornada.ts, donde Hora
  Inicio queda [disabled] al editar y no existe Hora de Fin en el formulario de editar.
  */
  describe('ampliaciones del Panel de Supervisor (forzar eliminar, editar horas)', () => {
    beforeEach(() => {
      component.abrir(asistenciaDePrueba);
      httpMock.expectOne((r) => r.urlWithParams.includes('registro-actividades') && r.urlWithParams.includes('asistencia_id')).flush([]);
      httpMock.expectOne((r) => r.urlWithParams.includes('/equipos')).flush([]);
      httpMock.expectOne((r) => r.urlWithParams.includes('/actividad')).flush([]);
    });

    it('eliminarRegistro(reg) sin forzar manda un DELETE sin "forzar" en el body', async () => {
      const promesa = component.eliminarRegistro({ id: 5 } as RegistroActividad);
      confirmacionService.responder(true);
      await promesa;

      const peticion = httpMock.expectOne((r) => r.method === 'DELETE' && r.url.includes('/registro-actividades/5'));
      expect(peticion.request.body).toBeNull();
      peticion.flush({ message: 'Labor eliminada correctamente.' });

      // Tras eliminar, el componente recarga la lista de labores (cargarRegistros()).
      httpMock.expectOne((r) => r.urlWithParams.includes('registro-actividades') && r.urlWithParams.includes('asistencia_id')).flush([]);
    });

    it('eliminarRegistro(reg, true) manda forzar:true en el body del DELETE', async () => {
      const promesa = component.eliminarRegistro({ id: 5 } as RegistroActividad, true);
      confirmacionService.responder(true);
      await promesa;

      const peticion = httpMock.expectOne((r) => r.method === 'DELETE' && r.url.includes('/registro-actividades/5'));
      expect(peticion.request.body).toEqual({ forzar: true });
      peticion.flush({ message: 'Labor eliminada correctamente.' });

      httpMock.expectOne((r) => r.urlWithParams.includes('registro-actividades') && r.urlWithParams.includes('asistencia_id')).flush([]);
    });

    it('eliminarRegistro no manda nada si el usuario cancela la confirmación', async () => {
      const promesa = component.eliminarRegistro({ id: 5 } as RegistroActividad, true);
      confirmacionService.responder(false);
      await promesa;

      httpMock.expectNone((r) => r.method === 'DELETE');
    });

    it('iniciarEdicionRegistro precarga Hora Inicio Y Hora Fin desde el registro (labor ya cerrada)', () => {
      component.iniciarEdicionRegistro({
        id: 9, hora_inicio: '2026-10-20T12:00:00.000Z', hora_fin: '2026-10-20T14:30:00.000Z',
        equipo_id: 1, actividad_id: 1,
      } as RegistroActividad);

      const inicioEsperado = new Date('2026-10-20T12:00:00.000Z');
      const finEsperado = new Date('2026-10-20T14:30:00.000Z');
      expect(component.horaInicioHH).toBe(inicioEsperado.getHours());
      expect(component.horaInicioMM).toBe(inicioEsperado.getMinutes());
      expect(component.horaFinHH).toBe(finEsperado.getHours());
      expect(component.horaFinMM).toBe(finEsperado.getMinutes());
    });

    it('iniciarEdicionRegistro deja Hora Fin en null si la labor sigue abierta (hora_fin null)', () => {
      component.iniciarEdicionRegistro({
        id: 9, hora_inicio: '2026-10-20T12:00:00.000Z', hora_fin: null,
        equipo_id: 1, actividad_id: 1,
      } as RegistroActividad);

      expect(component.horaFinHH).toBeNull();
      expect(component.horaFinMM).toBeNull();
    });

    it('guardar una edición manda hora_inicio y hora_fin en el PUT', () => {
      component.iniciarEdicionRegistro({
        id: 9, hora_inicio: '2026-10-20T12:00:00.000Z', hora_fin: null,
        equipo_id: 1, actividad_id: 2, observaciones: '',
      } as RegistroActividad);
      component.nuevoRegistro.equipo_id = 1;
      component.nuevoRegistro.actividad_id = 2;
      component.horaFinHH = 14;
      component.horaFinMM = 30;

      component.guardarNuevoRegistro();

      const peticion = httpMock.expectOne((r) => r.method === 'PUT' && r.url.includes('/registro-actividades/9'));
      expect(peticion.request.body.hora_inicio).toBeTruthy();
      expect(peticion.request.body.hora_fin).toBeTruthy();
      peticion.flush({ message: 'Labor actualizada correctamente.', registro: {} });

      httpMock.expectOne((r) => r.urlWithParams.includes('registro-actividades') && r.urlWithParams.includes('asistencia_id')).flush([]);
    });
  });
});
