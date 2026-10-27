import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { AgregarUsuarioModal } from './agregar-usuario-modal';
import { Operador } from '../../../../core/models/asistencia.model';

describe('AgregarUsuarioModal', () => {
  let component: AgregarUsuarioModal;
  let fixture: ComponentFixture<AgregarUsuarioModal>;
  let httpMock: HttpTestingController;

  const operadorDePrueba: Operador = { id: 7, codigo_megued: 'OP-7', nombre_completo: 'Trabajador de Prueba' };
  // Siempre en el pasado respecto a cualquier reloj real, para que esHoy sea predeciblemente false sin
  // depender de la fecha real del día en que corre la prueba.
  const FECHA_PASADA = '2020-01-15';

  // abrir() ahora dispara de una vez una búsqueda inicial (texto vacío, página 1) - cualquier prueba que
  // llame a abrir() tiene que responder esa petición antes de terminar, o httpMock.verify() (afterEach) falla
  // por una petición sin resolver. Salvo que se abra con operadorFijo, que no busca nada (ver test aparte).
  const abrirYResponderInicial = (opciones?: { supervisorId?: number | null; fecha?: string }, respuesta = { data: [] as Operador[], total: 0, pagina: 1, totalPaginas: 1 }) => {
    component.abrir(opciones);
    const peticion = httpMock.expectOne((r) => r.urlWithParams.includes('/operadores') && r.urlWithParams.includes('pagina=1') && r.urlWithParams.includes('limite=10'));
    peticion.flush(respuesta);
    return peticion;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgregarUsuarioModal],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(AgregarUsuarioModal);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
  });

  afterEach(() => httpMock.verify());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('abrir() muestra el modal, limpia el formulario y carga la lista inicial sin pedir texto', () => {
    const peticion = abrirYResponderInicial(undefined, { data: [operadorDePrueba], total: 1, pagina: 1, totalPaginas: 1 });

    expect(peticion.request.urlWithParams).not.toContain('supervisor_id');
    expect(component.visible).toBe(true);
    expect(component.busqueda).toBe('');
    expect(component.operadorSeleccionado).toBeNull();
    expect(component.resultados).toEqual([operadorDePrueba]);
    expect(component.totalPaginas).toBe(1);
    expect(component.esHoy).toBe(true);
    expect(component.requiereHoraManual).toBe(false);
  });

  it('abrir({ supervisorId }) manda supervisor_id en la carga inicial (caso ADMIN con Supervisor elegido)', () => {
    const peticion = abrirYResponderInicial({ supervisorId: 42 });
    expect(peticion.request.urlWithParams).toContain('supervisor_id=42');
  });

  // "+ Agregar Usuario" en fechas pasadas (pedido del usuario, 2026-10-27).
  describe('abrir({ fecha }) con un día anterior', () => {
    it('esHoy queda en false y pide hora de ingreso manual', () => {
      abrirYResponderInicial({ fecha: FECHA_PASADA });

      expect(component.esHoy).toBe(false);
      expect(component.fecha).toBe(FECHA_PASADA);
      expect(component.requiereHoraManual).toBe(true);
      expect(component.fechaFormateada).toBe('15/01/2020');
    });

    it('confirmarAgregar() no manda nada si falta la hora manual', () => {
      abrirYResponderInicial({ fecha: FECHA_PASADA });
      component.operadorSeleccionado = operadorDePrueba;

      component.confirmarAgregar();

      httpMock.expectNone((r) => r.urlWithParams.includes('/agregar-manual'));
    });

    it('confirmarAgregar() manda fecha y hora_ingreso manuales al completar HH/MM', () => {
      abrirYResponderInicial({ fecha: FECHA_PASADA });
      component.operadorSeleccionado = operadorDePrueba;
      component.horaIngresoHH = 7;
      component.horaIngresoMM = 30;

      component.confirmarAgregar();

      const peticion = httpMock.expectOne((r) => r.urlWithParams.includes('/agregar-manual'));
      expect(peticion.request.body.operador_id).toBe(7);
      expect(peticion.request.body.fecha).toBe(FECHA_PASADA);
      expect(peticion.request.body.hora_ingreso).toBeTruthy();
      peticion.flush({ message: 'ok', asistencia: { id: 1, operador_id: 7, fecha: FECHA_PASADA } });
    });
  });

  // Marcar ausente desde el roster completo (pedido del usuario, 2026-10-27): el modal se abre ya con el
  // operador fijo, sin buscar nada, y siempre pide la hora manual (haya pasado el día o no).
  describe('abrir({ operadorFijo })', () => {
    it('no dispara ninguna búsqueda, deja al operador ya seleccionado y pide hora manual aunque sea hoy', () => {
      component.abrir({ operadorFijo: operadorDePrueba });

      httpMock.expectNone((r) => r.urlWithParams.includes('/operadores'));
      expect(component.operadorSeleccionado).toEqual(operadorDePrueba);
      expect(component.esHoy).toBe(true);
      expect(component.requiereHoraManual).toBe(true);
    });

    it('confirmarAgregar() emite la Asistencia creada (no solo un evento vacío)', () => {
      component.abrir({ operadorFijo: operadorDePrueba });
      component.horaIngresoHH = 8;
      component.horaIngresoMM = 0;
      const emitSpy = vi.spyOn(component.agregado, 'emit');

      component.confirmarAgregar();

      const peticion = httpMock.expectOne((r) => r.urlWithParams.includes('/agregar-manual'));
      const asistenciaCreada = { id: 99, operador_id: 7, fecha: '2026-10-27', estado: 'EN_JORNADA' };
      peticion.flush({ message: 'ok', asistencia: asistenciaCreada });

      expect(emitSpy).toHaveBeenCalledWith(asistenciaCreada);
    });
  });

  it('buscar con texto (en tiempo real, con debounce) consulta /operadores y permite elegir un resultado', async () => {
    abrirYResponderInicial();

    component.busqueda = 'Traba';
    component.onBuscarChange();
    await new Promise((resolve) => setTimeout(resolve, 320));

    const peticion = httpMock.expectOne((r) => r.urlWithParams.includes('/operadores') && r.urlWithParams.includes('q=Traba') && r.urlWithParams.includes('pagina=1'));
    peticion.flush({ data: [operadorDePrueba], total: 1, pagina: 1, totalPaginas: 1 });

    expect(component.resultados).toEqual([operadorDePrueba]);

    component.seleccionarOperador(operadorDePrueba);
    expect(component.operadorSeleccionado).toEqual(operadorDePrueba);
    expect(component.busqueda).toBe('Trabajador de Prueba');
  });

  it('cambiarPagina() vuelve a buscar con el mismo texto en la página pedida, sin debounce', () => {
    abrirYResponderInicial(undefined, { data: [operadorDePrueba], total: 15, pagina: 1, totalPaginas: 2 });
    expect(component.totalPaginas).toBe(2);

    component.cambiarPagina(2);
    const peticion = httpMock.expectOne((r) => r.urlWithParams.includes('/operadores') && r.urlWithParams.includes('pagina=2'));
    peticion.flush({ data: [], total: 15, pagina: 2, totalPaginas: 2 });

    expect(component.paginaActual).toBe(2);
  });

  it('cambiarPagina() no hace nada fuera de rango (página 0 o mayor al total)', () => {
    abrirYResponderInicial(undefined, { data: [operadorDePrueba], total: 1, pagina: 1, totalPaginas: 1 });

    component.cambiarPagina(0);
    component.cambiarPagina(2);
    httpMock.expectNone((r) => r.urlWithParams.includes('/operadores'));
  });

  it('confirmarAgregar() llama a agregar-manual y emite (agregado) al terminar', () => {
    abrirYResponderInicial();
    component.operadorSeleccionado = operadorDePrueba;
    const emitSpy = vi.spyOn(component.agregado, 'emit');

    component.confirmarAgregar();

    const peticion = httpMock.expectOne((r) => r.urlWithParams.includes('/agregar-manual'));
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ operador_id: 7 });
    peticion.flush({ message: 'ok', asistencia: {} });

    expect(emitSpy).toHaveBeenCalled();
    expect(component.visible).toBe(false);
  });
});
