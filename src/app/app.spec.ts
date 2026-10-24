import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { App } from './app';
import { AUTH_STORAGE, AUTH_STORAGE_KEY, AuthService } from './core/services/auth';
import { authGuard } from './core/services/auth-guard';
import { WakeNoticeService } from './core/services/wake-notice';
import { environment } from '../environments/environment';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
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

  it('avisa de que los servidores pueden estar despertando solo cuando una peticion tarda', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const aviso = TestBed.inject(WakeNoticeService);
    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('.aviso-despertando')).toBeNull();

    aviso.slow.set(true);
    fixture.detectChanges();

    expect(html.querySelector('.aviso-despertando')?.textContent).toContain('servidores');
    expect(html.querySelector('.aviso-despertando')?.getAttribute('role')).toBe('status');

    aviso.slow.set(false);
    fixture.detectChanges();

    expect(html.querySelector('.aviso-despertando')).toBeNull();
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

  it('la pantalla de login esta disponible sin proteger', () => {
    const login = routes.find((r) => r.path === 'login');

    expect(login).toBeDefined();
    expect(login?.canActivate).toBeUndefined();
  });

  it('las pantallas de DJ y de telemetria pasan por el guard de login', () => {
    for (const ruta of ['dj', 'dashboard']) {
      expect(routes.find((r) => r.path === ruta)?.canActivate, ruta).toEqual([authGuard]);
    }
  });

  it('la ruta vacia redirige al dashboard', () => {
    const raiz = routes.find((r) => r.path === '');

    expect(raiz?.redirectTo).toBe('dashboard');
    expect(raiz?.pathMatch).toBe('full');
  });
});

describe('cerrar sesion', () => {
  const STATUS = `${environment.apiRootUrl}/auth/status`;

  function crear(opciones: { exige: boolean; sesion: boolean }) {
    const datos = new Map<string, string>();
    if (opciones.sesion) {
      datos.set(AUTH_STORAGE_KEY, JSON.stringify({ token: 'abc', expiresAt: '2999-01-01T00:00:00Z' }));
    }
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AUTH_STORAGE,
          useValue: {
            getItem: (k: string) => datos.get(k) ?? null,
            setItem: (k: string, v: string) => datos.set(k, v),
            removeItem: (k: string) => datos.delete(k),
          },
        },
      ],
    });
    const auth = TestBed.inject(AuthService);
    auth.status().subscribe();
    TestBed.inject(HttpTestingController).expectOne(STATUS).flush({ enabled: opciones.exige });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    return { fixture, auth };
  }

  const boton = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.cerrar-sesion');

  it('con login exigido y sesion iniciada ofrece cerrar sesion', () => {
    const { fixture } = crear({ exige: true, sesion: true });

    expect(boton(fixture)?.textContent?.trim()).toBe('Cerrar sesion');
  });

  it('sin login exigido no muestra el boton', () => {
    const { fixture } = crear({ exige: false, sesion: false });

    expect(boton(fixture)).toBeNull();
  });

  it('con login exigido pero sin sesion tampoco', () => {
    const { fixture } = crear({ exige: true, sesion: false });

    expect(boton(fixture)).toBeNull();
  });

  it('al pulsarlo cierra la sesion, quita el boton y lleva al login', () => {
    const { fixture, auth } = crear({ exige: true, sesion: true });
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    boton(fixture)!.click();
    fixture.detectChanges();

    expect(auth.authenticated()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
    expect(boton(fixture)).toBeNull();
  });
});
