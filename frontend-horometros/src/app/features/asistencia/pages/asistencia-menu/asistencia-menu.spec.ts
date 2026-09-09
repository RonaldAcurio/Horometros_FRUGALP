import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AsistenciaMenu } from './asistencia-menu';

describe('AsistenciaMenu', () => {
  let component: AsistenciaMenu;
  let fixture: ComponentFixture<AsistenciaMenu>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AsistenciaMenu],
    }).compileComponents();

    fixture = TestBed.createComponent(AsistenciaMenu);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
