import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DirectorioOperadores } from './directorio-operadores';

describe('DirectorioOperadores', () => {
  let component: DirectorioOperadores;
  let fixture: ComponentFixture<DirectorioOperadores>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DirectorioOperadores],
    }).compileComponents();

    fixture = TestBed.createComponent(DirectorioOperadores);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
