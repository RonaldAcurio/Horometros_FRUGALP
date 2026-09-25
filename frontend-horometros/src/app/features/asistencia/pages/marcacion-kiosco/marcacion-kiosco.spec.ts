// Excluido del test target (ver angular.json, "test" > "exclude"): el componente importa
// ZXingScannerModule (@zxing/ngx-scanner), que a su vez importa @zxing/library - un paquete CommonJS que
// exporta "named exports" (BarcodeFormat, etc.) de una forma que el entorno de pruebas basado en Vitest no
// puede resolver ("Named export 'BarcodeFormat' not found"), aunque en el navegador real (ng serve/ng build)
// funciona sin problema - es una incompatibilidad de bundler para pruebas, no un bug de la app.
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
