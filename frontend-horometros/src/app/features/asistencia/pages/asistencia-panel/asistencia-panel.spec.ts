import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AsistenciaPanel } from './asistencia-panel';

describe('AsistenciaPanel', () => {
  let component: AsistenciaPanel;
  let fixture: ComponentFixture<AsistenciaPanel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AsistenciaPanel],
    }).compileComponents();

    fixture = TestBed.createComponent(AsistenciaPanel);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
