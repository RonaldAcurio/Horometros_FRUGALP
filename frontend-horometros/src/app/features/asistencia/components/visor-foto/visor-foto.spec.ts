import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VisorFoto } from './visor-foto';

describe('VisorFoto', () => {
  let component: VisorFoto;
  let fixture: ComponentFixture<VisorFoto>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VisorFoto],
    }).compileComponents();

    fixture = TestBed.createComponent(VisorFoto);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
