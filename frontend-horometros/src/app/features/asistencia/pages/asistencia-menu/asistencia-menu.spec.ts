import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AsistenciaMenu } from './asistencia-menu';

describe('AsistenciaMenu', () => {
  let component: AsistenciaMenu;
  let fixture: ComponentFixture<AsistenciaMenu>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AsistenciaMenu],
      // El menu de 3 tarjetas usa RouterLink - necesita un router disponible para resolver.
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(AsistenciaMenu);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
