import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      // App usa RouterLink en su plantilla - sin proveer el router, TestBed no puede resolver
      // ActivatedRoute/Router y la creacion del componente falla con NG0201.
      providers: [provideRouter([])],
    })
      .compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    // El boilerplate original de "ng new" decia "Hello, frontend-horometros" - nunca coincidio con la app real.
    expect(compiled.querySelector('h1')?.textContent).toContain('FRUGALP');
  });
});
