import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { AUTH_STORAGE, AUTH_STORAGE_KEY } from './auth';
import { authInterceptor } from './auth-interceptor';
import { environment } from '../../../environments/environment';

const API = environment.apiRootUrl;

describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let router: Router;
  let storage: Map<string, string>;

  function crear(conSesion: boolean) {
    storage = new Map();
    if (conSesion) {
      storage.set(AUTH_STORAGE_KEY, JSON.stringify({ token: 'mi-token', expiresAt: '2999-01-01T00:00:00Z' }));
    }
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        {
          provide: AUTH_STORAGE,
          useValue: {
            getItem: (k: string) => storage.get(k) ?? null,
            setItem: (k: string, v: string) => storage.set(k, v),
            removeItem: (k: string) => storage.delete(k),
          },
        },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  }

  afterEach(() => backend.verify());

  describe('con sesion iniciada', () => {
    beforeEach(() => crear(true));

    it('agrega el token a las peticiones al API', () => {
      http.get(`${API}/tracks`).subscribe();

      expect(backend.expectOne(`${API}/tracks`).request.headers.get('Authorization')).toBe('Bearer mi-token');
    });

    it('lo agrega tambien a las demas rutas del API, como la subida de audio', () => {
      http.post(`${API}/tracks/analyze`, new FormData()).subscribe();

      expect(backend.expectOne(`${API}/tracks/analyze`).request.headers.get('Authorization')).toBe('Bearer mi-token');
    });

    it('no lo envia a otros servidores', () => {
      http.get('https://otro-servidor.example.com/api/v1/tracks').subscribe();

      expect(backend.expectOne('https://otro-servidor.example.com/api/v1/tracks').request.headers.has('Authorization')).toBe(false);
    });

    it('no lo envia a una direccion que solo empieza igual que la del API', () => {
      http.get(`${API}x/tracks`).subscribe();
      http.get(`${API}.malicioso.com/tracks`).subscribe();

      expect(backend.expectOne(`${API}x/tracks`).request.headers.has('Authorization')).toBe(false);
      expect(backend.expectOne(`${API}.malicioso.com/tracks`).request.headers.has('Authorization')).toBe(false);
    });

    it('no lo envia al login ni al estado, que son publicos', () => {
      http.post(`${API}/auth/login`, {}).subscribe();
      http.get(`${API}/auth/status`).subscribe();

      expect(backend.expectOne(`${API}/auth/login`).request.headers.has('Authorization')).toBe(false);
      expect(backend.expectOne(`${API}/auth/status`).request.headers.has('Authorization')).toBe(false);
    });

    it('un 401 del API cierra la sesion y lleva al login recordando donde estaba', () => {
      let fallo: unknown;
      http.get(`${API}/tracks`).subscribe({ error: (e) => (fallo = e) });

      backend.expectOne(`${API}/tracks`).flush({ error: 'No autorizado' }, { status: 401, statusText: 'Unauthorized' });

      expect(fallo).toBeDefined();
      expect(storage.has(AUTH_STORAGE_KEY)).toBe(false);
      expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/' } });
    });

    it('otros errores no tocan la sesion', () => {
      http.get(`${API}/tracks`).subscribe({ error: () => undefined });

      backend.expectOne(`${API}/tracks`).flush('error', { status: 500, statusText: 'Server Error' });

      expect(storage.has(AUTH_STORAGE_KEY)).toBe(true);
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('un 401 del propio login (credenciales malas) no cierra nada ni redirige', () => {
      http.post(`${API}/auth/login`, {}).subscribe({ error: () => undefined });

      backend.expectOne(`${API}/auth/login`).flush({ error: 'x' }, { status: 401, statusText: 'Unauthorized' });

      expect(storage.has(AUTH_STORAGE_KEY)).toBe(true);
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('un 401 de otro servidor no cierra la sesion', () => {
      http.get('https://otro-servidor.example.com/x').subscribe({ error: () => undefined });

      backend.expectOne('https://otro-servidor.example.com/x').flush({}, { status: 401, statusText: 'Unauthorized' });

      expect(storage.has(AUTH_STORAGE_KEY)).toBe(true);
    });
  });

  describe('sin sesion', () => {
    beforeEach(() => crear(false));

    it('no agrega ninguna cabecera', () => {
      http.get(`${API}/tracks`).subscribe();

      expect(backend.expectOne(`${API}/tracks`).request.headers.has('Authorization')).toBe(false);
    });

    it('no vuelve a navegar al login si ya se esta en el', () => {
      vi.spyOn(router, 'url', 'get').mockReturnValue('/login?returnUrl=%2Fdj');
      http.get(`${API}/tracks`).subscribe({ error: () => undefined });

      backend.expectOne(`${API}/tracks`).flush({}, { status: 401, statusText: 'Unauthorized' });

      expect(router.navigate).not.toHaveBeenCalled();
    });
  });
});
