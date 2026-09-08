import { TestBed } from '@angular/core/testing';
import { AsistenciaService } from './asistencia';

describe('Asistencia', () => {
  let service: AsistenciaService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AsistenciaService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
