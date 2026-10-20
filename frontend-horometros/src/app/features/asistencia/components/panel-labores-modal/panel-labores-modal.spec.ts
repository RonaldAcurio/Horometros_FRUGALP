import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { PanelLaboresModal } from './panel-labores-modal';
import { Asistencia } from '../../../../core/models/asistencia.model';

describe('PanelLaboresModal', () => {
  let component: PanelLaboresModal;
  let fixture: ComponentFixture<PanelLaboresModal>;
  let httpMock: HttpTestingController;

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
});
