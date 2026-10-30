import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { MiJornada } from './mi-jornada';
import { RegistroActividad } from '../../../../core/models/asistencia.model';
import { NotificacionService } from '../../../../core/services/notificacion.service';
import { formatearHorasTrabajadas } from '../../../../core/utils/horas-trabajadas.util';

/*
Resumen de horas antes de cerrar jornada (pedido del usuario, 2026-10-23): estos tests no llaman a
fixture.detectChanges() a propósito - eso dispararía ngOnInit (polling, QR, Preferences) que no hace falta
para probar marcarSalida()/cancelarCierreJornada(), que solo dependen de 'registros' y 'cargandoRegistros'
(ya en memoria, ver recalcularVistaRegistros).
*/
const laborCerrada = (id: number, horaInicio: string, horaFin: string): RegistroActividad =>
  ({ id, hora_inicio: horaInicio, hora_fin: horaFin }) as RegistroActividad;

const laborAbierta = (id: number, horaInicio: string): RegistroActividad =>
  ({ id, hora_inicio: horaInicio, hora_fin: null }) as RegistroActividad;

describe('MiJornada', () => {
  let component: MiJornada;
  let fixture: ComponentFixture<MiJornada>;
  let notificacionService: NotificacionService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MiJornada],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(MiJornada);
    component = fixture.componentInstance;
    notificacionService = TestBed.inject(NotificacionService);
    // Ya no está "cargando" sus labores - arranca en true a propósito (ver bloquearSiHayLaboresAbiertas)
    // para no dejar pasar la salida por una lista todavía vacía mientras cargarRegistros() responde.
    component.cargandoRegistros = false;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('marcarSalida (resumen de horas antes de cerrar jornada)', () => {
    it('sin labores abiertas: calcula el total de horas YA CERRADAS y pasa a confirmandoSalida', async () => {
      component.registros = [
        laborCerrada(1, '2026-10-23T08:00:00.000Z', '2026-10-23T10:00:00.000Z'), // 2h
        laborCerrada(2, '2026-10-23T11:00:00.000Z', '2026-10-23T11:30:00.000Z'), // 30min
      ];

      await component.marcarSalida();

      expect(component.confirmandoSalida).toBe(true);
      expect(component.horasTrabajadasHoyTexto).toBe(formatearHorasTrabajadas(2.5));
    });

    /*
    bloquearSiHayLaboresAbiertas() ya impide llegar al resumen con una labor abierta "de verdad" (ver el
    test de más abajo) - esto prueba la suma en sí (calcularHorasTrabajadasHoy, privado) sin esa guardia
    de por medio: una labor sin hora_fin nunca debe contar en el total, pase lo que pase alrededor.
    */
    it('calcularHorasTrabajadasHoy ignora labores sin hora_fin al sumar', () => {
      component.registros = [
        laborCerrada(1, '2026-10-23T08:00:00.000Z', '2026-10-23T09:00:00.000Z'), // 1h
        laborAbierta(2, '2026-10-23T09:30:00.000Z'),
      ];

      const horas = (component as unknown as { calcularHorasTrabajadasHoy(): number }).calcularHorasTrabajadasHoy();

      expect(horas).toBe(1);
    });

    it('sin ninguna labor cerrada todavía: el total es 0', async () => {
      component.registros = [];

      await component.marcarSalida();

      expect(component.confirmandoSalida).toBe(true);
      expect(component.horasTrabajadasHoyTexto).toBe(formatearHorasTrabajadas(0));
    });

    it('con labores abiertas: bloquea el cierre y NUNCA llega a mostrar el resumen', async () => {
      component.registros = [laborAbierta(1, '2026-10-23T08:00:00.000Z')];
      const advertenciaSpy = vi.spyOn(notificacionService, 'advertencia');

      await component.marcarSalida();

      expect(component.confirmandoSalida).toBe(false);
      expect(advertenciaSpy).toHaveBeenCalled();
    });
  });

  describe('cancelarCierreJornada ("Editar mi jornada")', () => {
    it('cierra el resumen y regresa al Panel de Actividades sin disparar nada más', () => {
      component.confirmandoSalida = true;
      component.horasTrabajadasHoyTexto = '2h 30min';

      component.cancelarCierreJornada();

      expect(component.confirmandoSalida).toBe(false);
    });
  });
});
