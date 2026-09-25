import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { SupervisorPanel } from './supervisor-panel';

describe('SupervisorPanel', () => {
  let component: SupervisorPanel;
  let fixture: ComponentFixture<SupervisorPanel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SupervisorPanel],
      // RouterLink en la plantilla + varios servicios inyectados que usan HttpClient
      // (AsistenciaService, HaciendaService, UsuarioService) necesitan ambos providers.
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();

    fixture = TestBed.createComponent(SupervisorPanel);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
