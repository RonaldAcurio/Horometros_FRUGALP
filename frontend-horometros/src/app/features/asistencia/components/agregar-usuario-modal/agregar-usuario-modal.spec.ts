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

  it('abrir() muestra el modal con el formulario vacío', () => {
    component.abrir();
    expect(component.visible).toBe(true);
    expect(component.busqueda).toBe('');
    expect(component.operadorSeleccionado).toBeNull();
  });

  it('buscar con texto vacío no pide nada al backend', () => {
    component.abrir();
    component.busqueda = '  ';
    component.onBuscarChange();
    httpMock.expectNone((r) => r.urlWithParams.includes('/operadores'));
  });

  it('buscar con texto consulta /operadores (con debounce) y permite elegir un resultado', async () => {
    component.abrir();
    component.busqueda = 'Traba';
    component.onBuscarChange();

    // Debounce real de 300ms (ver onBuscarChange) - se espera el tiempo real en vez de fakeAsync/tick, que
    // esta configuracion de pruebas (vitest, @angular/build:unit-test) no trae habilitado (zone-testing).
    await new Promise((resolve) => setTimeout(resolve, 320));

    const peticion = httpMock.expectOne((r) => r.urlWithParams.includes('/operadores') && r.urlWithParams.includes('q=Traba'));
    peticion.flush({ data: [operadorDePrueba], total: 1, pagina: 1, totalPaginas: 1 });

    expect(component.resultados).toEqual([operadorDePrueba]);

    component.seleccionarOperador(operadorDePrueba);
    expect(component.operadorSeleccionado).toEqual(operadorDePrueba);
    expect(component.busqueda).toBe('Trabajador de Prueba');
    expect(component.resultados).toEqual([]);
  });

  it('confirmarAgregar() llama a agregar-manual y emite (agregado) al terminar', () => {
    component.abrir();
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
