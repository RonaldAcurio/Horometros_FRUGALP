import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CargaLoteComponent } from './carga-lote.component';

describe('CargaLoteComponent', () => {
  let component: CargaLoteComponent;
  let fixture: ComponentFixture<CargaLoteComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CargaLoteComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CargaLoteComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
