import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('renderiza el router-outlet donde se cargan las pantallas', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).not.toBeNull();
  });

  it('ofrece la navegacion entre la pantalla de DJ y la de telemetria', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const enlaces = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('nav a'));

    expect(enlaces.map((a) => a.textContent?.trim())).toEqual(['DJ', 'Telemetria']);
    expect(enlaces.map((a) => a.getAttribute('href'))).toEqual(['/dj', '/dashboard']);
  });

  it('la navegacion esta etiquetada para lectores de pantalla', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('nav')?.getAttribute('aria-label')).toBe('Principal');
  });
});

describe('rutas de la aplicacion', () => {
  const rutas = () => routes.map((r) => r.path);

  it('tiene la pantalla de DJ y la de telemetria', () => {
    expect(rutas()).toContain('dj');
    expect(rutas()).toContain('dashboard');
  });

  it('la ruta vacia redirige al dashboard', () => {
    const raiz = routes.find((r) => r.path === '');

    expect(raiz?.redirectTo).toBe('dashboard');
    expect(raiz?.pathMatch).toBe('full');
  });
});
