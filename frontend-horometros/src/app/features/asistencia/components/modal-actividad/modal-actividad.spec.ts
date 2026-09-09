import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalActividad } from './modal-actividad';

describe('ModalActividad', () => {
  let component: ModalActividad;
  let fixture: ComponentFixture<ModalActividad>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModalActividad],
    }).compileComponents();

    fixture = TestBed.createComponent(ModalActividad);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
