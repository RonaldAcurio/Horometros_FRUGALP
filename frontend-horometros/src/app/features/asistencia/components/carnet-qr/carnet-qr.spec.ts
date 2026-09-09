import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CarnetQr } from './carnet-qr';

describe('CarnetQr', () => {
  let component: CarnetQr;
  let fixture: ComponentFixture<CarnetQr>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CarnetQr],
    }).compileComponents();

    fixture = TestBed.createComponent(CarnetQr);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
