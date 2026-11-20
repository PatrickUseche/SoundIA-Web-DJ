import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { Observable } from 'rxjs';
import { AUTH_STORAGE, AUTH_STORAGE_KEY } from './auth';
import { authGuard } from './auth-guard';
import { environment } from '../../../environments/environment';

const STATUS = `${environment.apiRootUrl}/auth/status`;

describe('authGuard', () => {
  let backend: HttpTestingController;
  let router: Router;

  function crear(conSesion: boolean) {
    const datos = new Map<string, string>();
    if (conSesion) {
      datos.set(AUTH_STORAGE_KEY, JSON.stringify({ token: 'abc', expiresAt: '2999-01-01T00:00:00Z' }));
    }
    TestBed.configureTestingModule({
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
    backend = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  }

  /** Pide pasar a `url` y devuelve lo que decide el guard; `respuesta` es lo que contesta el API al preguntar por el login. */
  function pedir(url: string, reply?: () => void): boolean | UrlTree | undefined {
    let outcome: boolean | UrlTree | undefined;
    const salida = TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    ) as Observable<boolean | UrlTree>;
    salida.subscribe((rawValue) => (outcome = rawValue));
    reply?.();
    return outcome;
  }

  const contesta = (cuerpo: string | object, opciones?: { status: number; statusText: string }) => () =>
    backend.expectOne(STATUS).flush(cuerpo, opciones);

  afterEach(() => backend.verify());

  it('deja pasar si el API no exige login', () => {
    crear(false);

    expect(pedir('/dj', contesta({ enabled: false }))).toBe(true);
  });

  it('deja pasar si el API exige login y ya hay una sesion', () => {
    crear(true);

    expect(pedir('/dj', contesta({ enabled: true }))).toBe(true);
  });

  it('lleva al login, recordando a donde iba, si el API exige login y no hay sesion', () => {
    crear(false);

    const outcome = pedir('/dj', contesta({ enabled: true }));

    expect(outcome).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(outcome as UrlTree)).toBe('/login?returnUrl=%2Fdj');
  });

  it('si no se puede saber si hay login, deja pasar: el API es quien protege de verdad', () => {
    crear(false);

    expect(pedir('/dashboard', contesta('error', { status: 500, statusText: 'Server Error' }))).toBe(true);
  });

  it('no vuelve a preguntar al API una vez que sabe la respuesta', () => {
    crear(false);
    pedir('/dj', contesta({ enabled: false }));

    expect(pedir('/dashboard')).toBe(true);
    backend.expectNone(STATUS);
  });
});
