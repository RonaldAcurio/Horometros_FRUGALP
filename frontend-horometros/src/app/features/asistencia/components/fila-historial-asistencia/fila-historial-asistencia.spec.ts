import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FilaHistorialAsistencia } from './fila-historial-asistencia';
import { Asistencia } from '../../../../core/models/asistencia.model';

describe('FilaHistorialAsistencia', () => {
  let component: FilaHistorialAsistencia;
  let fixture: ComponentFixture<FilaHistorialAsistencia>;

  const regBase: Asistencia = {
    id: 1, operador_id: 7, fecha: '2026-10-26', hora_ingreso: '2026-10-26T13:00:00.000Z',
    estado: 'EN_JORNADA', total_horas: 2.5,
    operador: { id: 7, codigo_megued: 'OP-7', nombre_completo: 'Anthony Paul Andrade' },
  } as Asistencia;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FilaHistorialAsistencia],
    }).compileComponents();

    fixture = TestBed.createComponent(FilaHistorialAsistencia);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    component.reg = regBase;
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('mostrarOperador=true muestra la celda del nombre (tabla general del Historial)', () => {
    component.reg = regBase;
    component.mostrarOperador = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Anthony Paul Andrade');
  });

  it('mostrarOperador=false oculta la celda del nombre (modal "Historial de Asistencia" por trabajador, pedido del usuario, 2026-10-28: el nombre ya está en el título del modal)', () => {
    component.reg = regBase;
    component.mostrarOperador = false;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Anthony Paul Andrade');
  });

  /*
  El bug reportado (pedido del usuario, 2026-10-28): un día marcado OBSERVANDO (X) seguía mostrando
  "No aplica" y ocultando Ver/Imprimir en el Historial de Asistente, aunque supervisor-panel.html ya
  lo había arreglado en PR #63. Esta prueba confirma que la fila compartida YA NO oculta nada.
  */
  it('Ver/Imprimir siguen visibles aunque el día esté marcado OBSERVANDO (ya no sale "No aplica")', () => {
    component.reg = { ...regBase, estado: 'OBSERVANDO' };
    fixture.detectChanges();

    const texto = fixture.nativeElement.textContent;
    expect(texto).not.toContain('No aplica');
    expect(texto).toContain('👁️ Ver');
    expect(texto).toContain('🖨️ Imprimir');
    expect(texto).toContain('❌ No presente');
  });

  it('"Ver"/"Imprimir" emiten el reg correspondiente al hacer clic', () => {
    component.reg = regBase;
    fixture.detectChanges();
    const verSpy = vi.fn();
    const imprimirSpy = vi.fn();
    component.ver.subscribe(verSpy);
    component.imprimir.subscribe(imprimirSpy);

    const botones: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll('button');
    botones[0].click();
    botones[1].click();

    expect(verSpy).toHaveBeenCalledWith(regBase);
    expect(imprimirSpy).toHaveBeenCalledWith(regBase);
  });
});
