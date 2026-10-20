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

  // abrir() ahora dispara de una vez una búsqueda inicial (texto vacío, página 1) - cualquier prueba que
  // llame a abrir() tiene que responder esa petición antes de terminar, o httpMock.verify() (afterEach) falla
  // por una petición sin resolver.
  const abrirYResponderInicial = (supervisorId?: number | null, respuesta = { data: [] as Operador[], total: 0, pagina: 1, totalPaginas: 1 }) => {
    component.abrir(supervisorId);
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
    const peticion = abrirYResponderInicial(null, { data: [operadorDePrueba], total: 1, pagina: 1, totalPaginas: 1 });

    expect(peticion.request.urlWithParams).not.toContain('supervisor_id');
    expect(component.visible).toBe(true);
    expect(component.busqueda).toBe('');
    expect(component.operadorSeleccionado).toBeNull();
    expect(component.resultados).toEqual([operadorDePrueba]);
    expect(component.totalPaginas).toBe(1);
  });

  it('abrir(supervisorId) manda supervisor_id en la carga inicial (caso ADMIN con Supervisor elegido)', () => {
    const peticion = abrirYResponderInicial(42);
    expect(peticion.request.urlWithParams).toContain('supervisor_id=42');
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
    abrirYResponderInicial(null, { data: [operadorDePrueba], total: 15, pagina: 1, totalPaginas: 2 });
    expect(component.totalPaginas).toBe(2);

    component.cambiarPagina(2);
    const peticion = httpMock.expectOne((r) => r.urlWithParams.includes('/operadores') && r.urlWithParams.includes('pagina=2'));
    peticion.flush({ data: [], total: 15, pagina: 2, totalPaginas: 2 });

    expect(component.paginaActual).toBe(2);
  });

  it('cambiarPagina() no hace nada fuera de rango (página 0 o mayor al total)', () => {
    abrirYResponderInicial(null, { data: [operadorDePrueba], total: 1, pagina: 1, totalPaginas: 1 });

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
