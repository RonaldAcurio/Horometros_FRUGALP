import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { MiPerfil } from './mi-perfil';
import { AuthService } from '../../../../core/services/auth.service';
import { ConfirmacionService } from '../../../../core/services/confirmacion.service';
import { PerfilCuenta } from '../../../../core/models/auth.model';

/*
"Mi Perfil" del trabajador (pedido del usuario, 2026-10-28): historial propio (siempre vía GET
/asistencia/mi-historial, nunca el historial general) y cambio de usuario (PUT /asistencia/mi-usuario,
nunca la clave). ConfirmacionService se reemplaza por un mock controlable - evita depender de <app-confirm-modal>
para resolver la Promise de preguntar().
*/
const perfilOperador: PerfilCuenta = {
  id: 7, nombre_completo: 'Anthony Paul Andrade', rol: 'MECANICO', hacienda_id: 1,
  terminos_aceptados: true, usuario: 'anthony_op',
  telefono: '0999111222', direccion: 'Calle Falsa 123', cedula: '1234567890',
};

describe('MiPerfil', () => {
  let component: MiPerfil;
  let fixture: ComponentFixture<MiPerfil>;
  let httpMock: HttpTestingController;
  let authService: AuthService;
  let confirmacionPreguntar: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    confirmacionPreguntar = vi.fn().mockResolvedValue(true);

    await TestBed.configureTestingModule({
      imports: [MiPerfil],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ConfirmacionService, useValue: { preguntar: confirmacionPreguntar } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MiPerfil);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    authService = TestBed.inject(AuthService);
    authService.perfil.set(perfilOperador);

    fixture.detectChanges(); // dispara ngOnInit -> buscarHistorial()
    httpMock.expectOne((r) => r.url.includes('/mi-historial')).flush({ data: [], total: 0, pagina: 1, totalPaginas: 1 });
  });

  afterEach(() => httpMock.verify());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('carga el propio historial al iniciar (GET /asistencia/mi-historial, nunca /historial general)', () => {
    // La petición inicial ya se resolvió en beforeEach con httpMock.expectOne - si hubiera llamado a
    // /historial en vez de /mi-historial, ese expectOne habría fallado ahí mismo.
    expect(component.historial).toEqual([]);
  });

  it('el QR del carnet se genera 100% en el cliente - no pide nada al backend', () => {
    // El contenido real del QR (QRCode.toDataURL) depende de un canvas, que jsdom no soporta sin el paquete
    // 'canvas' (mismo motivo por el que mi-jornada.spec.ts evita por completo disparar su QR, ver ese
    // archivo) - lo que SÍ se puede probar acá, y es lo que importa para este componente, es que generar el
    // QR del carnet nunca dispara ninguna petición HTTP (mismo payload {operador_id} que ya usa
    // generarQR en asistencia-panel.ts, confirmado en el plan).
    httpMock.expectNone((r) => r.url.includes('qr') || r.url.includes('marcar-qr'));
  });

  describe('historial en modal (pedido del usuario, 2026-10-29)', () => {
    it('el historial queda oculto por defecto y "Ver historial" lo muestra', () => {
      expect(component.mostrarHistorial()).toBe(false);
      component.abrirHistorial();
      expect(component.mostrarHistorial()).toBe(true);
      component.cerrarHistorial();
      expect(component.mostrarHistorial()).toBe(false);
    });
  });

  describe('edición de datos (teléfono/dirección)', () => {
    it('abrirEdicionDatos precarga teléfono/dirección actuales', () => {
      component.abrirEdicionDatos();
      expect(component.editandoDatos()).toBe(true);
      expect(component.nuevoTelefono).toBe('0999111222');
      expect(component.nuevaDireccion).toBe('Calle Falsa 123');
    });

    it('cancelarEdicionDatos cierra sin llamar al backend', () => {
      component.abrirEdicionDatos();
      component.nuevoTelefono = '0000000000';
      component.cancelarEdicionDatos();

      expect(component.editandoDatos()).toBe(false);
      httpMock.expectNone((r) => r.url.includes('/operadores/'));
    });

    it('guardarDatos manda PUT /asistencia/operadores/:id con el propio id y actualiza el perfil local sin cerrar sesión', () => {
      const logoutSpy = vi.spyOn(authService, 'logout').mockImplementation(() => {});
      component.abrirEdicionDatos();
      component.nuevoTelefono = '0987654321';
      component.nuevaDireccion = 'Nueva Dirección 456';
      component.guardarDatos();

      const peticion = httpMock.expectOne((r) => r.url.endsWith('/asistencia/operadores/7'));
      expect(peticion.request.method).toBe('PUT');
      expect(peticion.request.body).toEqual({ telefono: '0987654321', direccion: 'Nueva Dirección 456' });
      peticion.flush({ message: 'Operador actualizado exitosamente', operador: {} });

      expect(authService.perfil()?.telefono).toBe('0987654321');
      expect(authService.perfil()?.direccion).toBe('Nueva Dirección 456');
      expect(component.editandoDatos()).toBe(false);
      // Editar datos NO fuerza logout - a diferencia de usuario/clave, el backend no invalida la sesión.
      expect(logoutSpy).not.toHaveBeenCalled();
    });
  });

  describe('restablecer clave (autoservicio, pedido del usuario, 2026-10-29)', () => {
    it('rechaza una clave de menos de 8 caracteres sin pedir confirmación ni llamar al backend', async () => {
      component.abrirEdicionClave();
      component.nuevaClave = 'corta';
      component.repetirClave = 'corta';

      await component.guardarClave();

      expect(confirmacionPreguntar).not.toHaveBeenCalled();
      httpMock.expectNone((r) => r.url.includes('/mi-clave'));
    });

    it('rechaza si las claves no coinciden, sin pedir confirmación ni llamar al backend', async () => {
      component.abrirEdicionClave();
      component.nuevaClave = 'ClaveNueva123';
      component.repetirClave = 'OtraClave123';

      await component.guardarClave();

      expect(confirmacionPreguntar).not.toHaveBeenCalled();
      httpMock.expectNone((r) => r.url.includes('/mi-clave'));
    });

    it('guardarClave pide confirmación, manda PUT /asistencia/mi-clave y cierra sesión al terminar', async () => {
      const logoutSpy = vi.spyOn(authService, 'logout').mockImplementation(() => {});
      component.abrirEdicionClave();
      component.nuevaClave = 'ClaveNueva123';
      component.repetirClave = 'ClaveNueva123';

      const promesa = component.guardarClave();
      await Promise.resolve();

      expect(confirmacionPreguntar).toHaveBeenCalled();

      const peticion = httpMock.expectOne((r) => r.url.includes('/mi-clave'));
      expect(peticion.request.method).toBe('PUT');
      expect(peticion.request.body).toEqual({ clave: 'ClaveNueva123' });
      peticion.flush({ message: 'Clave actualizada.' });
      await promesa;

      expect(logoutSpy).toHaveBeenCalled();
    });

    it('si el trabajador cancela la confirmación, no manda ninguna petición', async () => {
      confirmacionPreguntar.mockResolvedValue(false);
      component.abrirEdicionClave();
      component.nuevaClave = 'ClaveNueva123';
      component.repetirClave = 'ClaveNueva123';

      await component.guardarClave();

      httpMock.expectNone((r) => r.url.includes('/mi-clave'));
    });
  });

  describe('edición de usuario', () => {
    it('abrirEdicionUsuario precarga el usuario actual', () => {
      component.abrirEdicionUsuario();
      expect(component.editandoUsuario()).toBe(true);
      expect(component.nuevoUsuario).toBe('anthony_op');
    });

    it('cancelarEdicionUsuario cierra la edición sin llamar al backend', () => {
      component.abrirEdicionUsuario();
      component.nuevoUsuario = 'otro_usuario';
      component.cancelarEdicionUsuario();

      expect(component.editandoUsuario()).toBe(false);
      httpMock.expectNone((r) => r.url.includes('/mi-usuario'));
    });

    it('guardarUsuario pide confirmación, manda SOLO "usuario" (nunca clave) y cierra sesión al terminar', async () => {
      const logoutSpy = vi.spyOn(authService, 'logout').mockImplementation(() => {});
      component.abrirEdicionUsuario();
      component.nuevoUsuario = 'anthony_nuevo';

      const promesa = component.guardarUsuario();
      await Promise.resolve(); // deja correr el await de confirmacionService.preguntar()

      expect(confirmacionPreguntar).toHaveBeenCalled();

      const peticion = httpMock.expectOne((r) => r.url.includes('/mi-usuario'));
      expect(peticion.request.method).toBe('PUT');
      expect(peticion.request.body).toEqual({ usuario: 'anthony_nuevo' });
      peticion.flush({ message: 'Usuario actualizado.', usuario: 'anthony_nuevo' });
      await promesa;

      expect(logoutSpy).toHaveBeenCalled();
    });

    it('si el trabajador cancela la confirmación, no manda ninguna petición', async () => {
      confirmacionPreguntar.mockResolvedValue(false);
      component.abrirEdicionUsuario();
      component.nuevoUsuario = 'anthony_nuevo';

      await component.guardarUsuario();

      httpMock.expectNone((r) => r.url.includes('/mi-usuario'));
    });

    it('no manda nada si el usuario nuevo queda vacío', async () => {
      component.abrirEdicionUsuario();
      component.nuevoUsuario = '   ';

      await component.guardarUsuario();

      expect(confirmacionPreguntar).not.toHaveBeenCalled();
      httpMock.expectNone((r) => r.url.includes('/mi-usuario'));
    });
  });
});
