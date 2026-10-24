import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { LoginComponent } from './login';
import { AUTH_STORAGE, AUTH_STORAGE_KEY } from '../../core/services/auth';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiRootUrl}/auth`;

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let backend: HttpTestingController;
  let router: Router;

  const el = () => fixture.nativeElement as HTMLElement;
  const campo = (id: string) => el().querySelector(`#${id}`) as HTMLInputElement;
  const boton = () => el().querySelector('button[type="submit"]') as HTMLButtonElement;

  function crear(opciones: { returnUrl?: string; sesion?: boolean; enabled?: boolean } = {}) {
    const datos = new Map<string, string>();
    if (opciones.sesion) {
      datos.set(AUTH_STORAGE_KEY, JSON.stringify({ token: 'abc', expiresAt: '2999-01-01T00:00:00Z' }));
    }
    TestBed.configureTestingModule({
      imports: [LoginComponent],
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
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap(opciones.returnUrl === undefined ? {} : { returnUrl: opciones.returnUrl }),
            },
          },
        },
      ],
    });
    backend = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    backend.expectOne(`${BASE}/status`).flush({ enabled: opciones.enabled ?? true });
    fixture.detectChanges();
  }

  function escribir(usuario: string, contrasena: string) {
    campo('login-usuario').value = usuario;
    campo('login-usuario').dispatchEvent(new Event('input'));
    campo('login-contrasena').value = contrasena;
    campo('login-contrasena').dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function enviar() {
    el().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
  }

  afterEach(() => backend?.verify());

  describe('formulario', () => {
    beforeEach(() => crear());

    it('pide usuario y contrasena con etiquetas y el autocompletado correcto', () => {
      expect(el().querySelector('label[for="login-usuario"]')?.textContent).toContain('Usuario');
      expect(el().querySelector('label[for="login-contrasena"]')?.textContent).toContain('Contraseña');
      expect(campo('login-usuario').autocomplete).toBe('username');
      expect(campo('login-contrasena').type).toBe('password');
      expect(campo('login-contrasena').autocomplete).toBe('current-password');
    });

    it('el boton no se activa hasta rellenar los dos campos', () => {
      expect(boton().disabled).toBe(true);

      escribir('dj', '');
      expect(boton().disabled).toBe(true);

      escribir('dj', 'clave');
      expect(boton().disabled).toBe(false);
    });

    it('no envia nada si los campos estan vacios', () => {
      enviar();

      backend.expectNone(`${BASE}/login`);
    });
  });

  describe('iniciar sesion', () => {
    it('envia las credenciales y, si son correctas, va a la pantalla que se pedia', () => {
      crear({ returnUrl: '/dj' });
      escribir('dj', 'clave');

      enviar();
      const peticion = backend.expectOne(`${BASE}/login`);
      expect(peticion.request.body).toEqual({ username: 'dj', password: 'clave' });
      peticion.flush({ token: 'abc', expiresAt: '2999-01-01T00:00:00Z' });

      expect(router.navigateByUrl).toHaveBeenCalledWith('/dj');
    });

    it('sin pantalla pedida va a la raiz', () => {
      crear();
      escribir('dj', 'clave');

      enviar();
      backend.expectOne(`${BASE}/login`).flush({ token: 'abc', expiresAt: '2999-01-01T00:00:00Z' });

      expect(router.navigateByUrl).toHaveBeenCalledWith('/');
    });

    it('nunca navega a otro sitio aunque se pida en la direccion', () => {
      for (const peligrosa of ['https://sitio-malicioso.com', '//sitio-malicioso.com', 'javascript:alert(1)', '/login', '/login?x=1']) {
        TestBed.resetTestingModule();
        crear({ returnUrl: peligrosa });
        escribir('dj', 'clave');

        enviar();
        backend.expectOne(`${BASE}/login`).flush({ token: 'abc', expiresAt: '2999-01-01T00:00:00Z' });

        expect(router.navigateByUrl, peligrosa).toHaveBeenCalledWith('/');
      }
    });

    it('mientras envia, el boton queda desactivado y no se envia dos veces', () => {
      crear();
      escribir('dj', 'clave');

      enviar();
      enviar();

      expect(boton().disabled).toBe(true);
      expect(boton().textContent).toContain('Entrando');
      backend.expectOne(`${BASE}/login`).flush({ token: 'abc', expiresAt: '2999-01-01T00:00:00Z' });
    });

    it('con credenciales incorrectas muestra un aviso, vacia la contrasena y deja reintentar', () => {
      crear();
      escribir('dj', 'mala');

      enviar();
      backend.expectOne(`${BASE}/login`).flush({ error: 'Usuario o contraseña incorrectos' }, { status: 401, statusText: 'Unauthorized' });
      fixture.detectChanges();

      expect(el().querySelector('[role="alert"]')?.textContent).toContain('Usuario o contraseña incorrectos');
      expect(campo('login-contrasena').value).toBe('');
      expect(campo('login-usuario').value).toBe('dj');
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });

    it('tras demasiados intentos dice cuanto esperar', () => {
      crear();
      escribir('dj', 'mala');

      enviar();
      backend.expectOne(`${BASE}/login`).flush(
        { error: 'Demasiados intentos' },
        { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '42' } },
      );
      fixture.detectChanges();

      expect(el().querySelector('[role="alert"]')?.textContent).toContain('Espera 42 s');
    });

    it('si el API no responde lo explica', () => {
      crear();
      escribir('dj', 'clave');

      enviar();
      backend.expectOne(`${BASE}/login`).error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
      fixture.detectChanges();

      expect(el().querySelector('[role="alert"]')?.textContent).toContain('No se pudo conectar');
    });

    it('al volver a intentar se quita el aviso anterior', () => {
      crear();
      escribir('dj', 'mala');
      enviar();
      backend.expectOne(`${BASE}/login`).flush({}, { status: 401, statusText: 'Unauthorized' });
      fixture.detectChanges();

      escribir('dj', 'clave');
      enviar();

      expect(el().querySelector('[role="alert"]')).toBeNull();
      backend.expectOne(`${BASE}/login`).flush({ token: 'abc', expiresAt: '2999-01-01T00:00:00Z' });
    });
  });

  describe('cuando no hace falta iniciar sesion', () => {
    it('si el API no exige login, sale de la pantalla', () => {
      crear({ enabled: false, returnUrl: '/dj' });

      expect(router.navigateByUrl).toHaveBeenCalledWith('/dj');
    });

    it('si ya hay una sesion, sale de la pantalla', () => {
      crear({ sesion: true });

      expect(router.navigateByUrl).toHaveBeenCalledWith('/');
    });
  });
});
