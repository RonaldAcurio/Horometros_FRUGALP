import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MarcacionKiosco } from './marcacion-kiosco';

describe('MarcacionKiosco', () => {
  let component: MarcacionKiosco;
  let fixture: ComponentFixture<MarcacionKiosco>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MarcacionKiosco],
    }).compileComponents();

    fixture = TestBed.createComponent(MarcacionKiosco);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
