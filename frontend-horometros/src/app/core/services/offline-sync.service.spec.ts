import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { OfflineSyncService } from './offline-sync.service';
import { RegistroActividadService } from './registro-actividad.service';

/*
@capacitor/network y @capacitor/preferences no se mockean: sus implementaciones "web" (navigator.onLine,
localStorage) corren tal cual en el entorno de pruebas, igual que en un navegador real - lo único que hace
falta controlar acá es RegistroActividadService, que es lo que decide si "hay señal" o no en cada caso.
*/
const payload = { asistencia_id: 1, equipo_id: 2, actividad_id: 3, hora_inicio: '2026-09-26T10:00:00.000Z' };

function errorRed(): any {
  return { status: 0 };
}

function errorServidor(mensaje: string): any {
  return { status: 400, error: { message: mensaje } };
}

describe('OfflineSyncService', () => {
  let service: OfflineSyncService;
  let registroActividadService: { crear: ReturnType<typeof vi.fn>; finalizar: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    localStorage.clear();
    registroActividadService = { crear: vi.fn(), finalizar: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: RegistroActividadService, useValue: registroActividadService }],
    });
    service = TestBed.inject(OfflineSyncService);
  });

  it('encola una labor nueva con id local negativo, sin tocar el servidor', async () => {
    await service.encolarCrearLabor(payload);

    expect(service.cola().length).toBe(1);
    expect(service.cola()[0].tipo).toBe('crear_labor');
    expect((service.cola()[0] as any).idLocal).toBeLessThan(0);
    expect(registroActividadService.crear).not.toHaveBeenCalled();
  });

  it('sincronizar: quita de la cola la operación que el servidor confirmó', async () => {
    registroActividadService.crear.mockReturnValue(of({ id: 99, ...payload }));
    await service.encolarCrearLabor(payload);

    await service.sincronizar();

    expect(service.cola().length).toBe(0);
    expect(registroActividadService.crear).toHaveBeenCalledWith(payload);
  });

  it('sincronizar: ante un fallo de RED (status 0) corta el recorrido y deja todo en cola para el próximo intento', async () => {
    registroActividadService.crear.mockReturnValue(throwError(() => errorRed()));
    await service.encolarCrearLabor(payload);
    await service.encolarCrearLabor({ ...payload, equipo_id: 4 });

    await service.sincronizar();

    expect(service.cola().length).toBe(2);
    expect(service.conectado()).toBe(false);
    // Se corta en el primero: el segundo item ni se intenta mientras no hay señal.
    expect(registroActividadService.crear).toHaveBeenCalledTimes(1);
  });

  it('sincronizar: ante un error REAL del servidor marca el ítem y sigue con el resto de la cola', async () => {
    registroActividadService.crear
      .mockReturnValueOnce(throwError(() => errorServidor('El equipo ya no existe.')))
      .mockReturnValueOnce(of({ id: 100, ...payload }));
    await service.encolarCrearLabor(payload);
    await service.encolarCrearLabor({ ...payload, equipo_id: 4 });

    await service.sincronizar();

    expect(service.cola().length).toBe(1);
    expect((service.cola()[0] as any).error).toBe('El equipo ya no existe.');
    expect(registroActividadService.crear).toHaveBeenCalledTimes(2);
  });

  it('descartar: quita una operación de la cola sin intentar sincronizarla', async () => {
    await service.encolarCrearLabor(payload);
    const op = service.cola()[0];

    await service.descartar(op);

    expect(service.cola().length).toBe(0);
    expect(registroActividadService.crear).not.toHaveBeenCalled();
  });

  it('pendientesCrearDeAsistencia: solo devuelve las operaciones "crear_labor" de la jornada pedida', async () => {
    await service.encolarCrearLabor(payload);
    await service.encolarCrearLabor({ ...payload, asistencia_id: 2 });
    await service.encolarFinalizarLabor(50);

    const pendientes = service.pendientesCrearDeAsistencia(1);

    expect(pendientes.length).toBe(1);
    expect(pendientes[0].payload.asistencia_id).toBe(1);
  });

  it('tieneFinalizacionPendiente: detecta un cierre encolado para un id real', async () => {
    await service.encolarFinalizarLabor(50);

    expect(service.tieneFinalizacionPendiente(50)).toBe(true);
    expect(service.tieneFinalizacionPendiente(51)).toBe(false);
  });
});
