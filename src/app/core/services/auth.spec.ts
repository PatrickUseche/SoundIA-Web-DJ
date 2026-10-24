import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AUTH_STORAGE, AUTH_STORAGE_KEY, AuthService } from './auth';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiRootUrl}/auth`;
const FUTURO = '2999-01-01T00:00:00Z';
const PASADO = '2000-01-01T00:00:00Z';

/** Almacenamiento de mentira en memoria. */
class FakeStorage {
  datos = new Map<string, string>();
  fallar = false;
  getItem(clave: string): string | null {
    if (this.fallar) {
      throw new DOMException('bloqueado', 'SecurityError');
    }
    return this.datos.get(clave) ?? null;
  }
  setItem(clave: string, valor: string): void {
    if (this.fallar) {
      throw new DOMException('lleno', 'QuotaExceededError');
    }
    this.datos.set(clave, valor);
  }
  removeItem(clave: string): void {
    if (this.fallar) {
      throw new DOMException('bloqueado', 'SecurityError');
    }
    this.datos.delete(clave);
  }
}

describe('AuthService', () => {
  let storage: FakeStorage;
  let http: HttpTestingController;

  function crear(guardado?: unknown): AuthService {
    storage = new FakeStorage();
    if (guardado !== undefined) {
      storage.datos.set(AUTH_STORAGE_KEY, typeof guardado === 'string' ? guardado : JSON.stringify(guardado));
    }
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AUTH_STORAGE, useValue: storage }],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(AuthService);
  }

  afterEach(() => http?.verify());

  describe('estado de la autenticacion', () => {
    it('empieza sin saber si el API exige login', () => {
      const auth = crear();

      expect(auth.enabled()).toBeNull();
    });

    it('pregunta al API una sola vez y recuerda la respuesta', () => {
      const auth = crear();
      let respuesta: boolean | undefined;

      auth.status().subscribe((enabled) => (respuesta = enabled));
      http.expectOne(`${BASE}/status`).flush({ enabled: true });

      expect(respuesta).toBe(true);
      expect(auth.enabled()).toBe(true);

      auth.status().subscribe();
      http.expectNone(`${BASE}/status`);
    });

    it('si el API dice que no hay login, lo recuerda', () => {
      const auth = crear();

      auth.status().subscribe();
      http.expectOne(`${BASE}/status`).flush({ enabled: false });

      expect(auth.enabled()).toBe(false);
    });

    it('si no se puede saber da por no exigido el login, pero no lo recuerda', () => {
      const auth = crear();
      let respuesta: boolean | undefined;

      auth.status().subscribe((enabled) => (respuesta = enabled));
      http.expectOne(`${BASE}/status`).flush('error', { status: 500, statusText: 'Server Error' });

      expect(respuesta).toBe(false);
      expect(auth.enabled()).toBeNull();

      auth.status().subscribe();
      http.expectOne(`${BASE}/status`).flush({ enabled: true });
      expect(auth.enabled()).toBe(true);
    });
  });

  describe('iniciar y cerrar sesion', () => {
    it('login envia las credenciales, guarda el token y marca la sesion como iniciada', () => {
      const auth = crear();

      auth.login('dj', 'clave').subscribe();
      const peticion = http.expectOne(`${BASE}/login`);
      expect(peticion.request.method).toBe('POST');
      expect(peticion.request.body).toEqual({ username: 'dj', password: 'clave' });
      peticion.flush({ token: 'abc.def.ghi', expiresAt: FUTURO });

      expect(auth.token()).toBe('abc.def.ghi');
      expect(auth.authenticated()).toBe(true);
      expect(auth.enabled()).toBe(true);
      expect(JSON.parse(storage.datos.get(AUTH_STORAGE_KEY)!)).toEqual({ token: 'abc.def.ghi', expiresAt: FUTURO });
    });

    it('si el login falla no queda ninguna sesion', () => {
      const auth = crear();
      let error: unknown;

      auth.login('dj', 'mala').subscribe({ error: (e) => (error = e) });
      http.expectOne(`${BASE}/login`).flush({ error: 'Usuario o contraseña incorrectos' }, { status: 401, statusText: 'Unauthorized' });

      expect(error).toBeDefined();
      expect(auth.authenticated()).toBe(false);
      expect(auth.token()).toBeNull();
      expect(storage.datos.size).toBe(0);
    });

    it('un token ya caducado no cuenta como sesion iniciada', () => {
      const auth = crear();

      auth.login('dj', 'clave').subscribe();
      http.expectOne(`${BASE}/login`).flush({ token: 'abc', expiresAt: PASADO });

      expect(auth.authenticated()).toBe(false);
    });

    it('logout borra la sesion de la memoria y del almacenamiento', () => {
      const auth = crear({ token: 'abc', expiresAt: FUTURO });
      expect(auth.authenticated()).toBe(true);

      auth.logout();

      expect(auth.authenticated()).toBe(false);
      expect(auth.token()).toBeNull();
      expect(storage.datos.has(AUTH_STORAGE_KEY)).toBe(false);
    });

    it('si el almacenamiento falla, la sesion sigue funcionando en memoria', () => {
      const auth = crear();
      storage.fallar = true;

      auth.login('dj', 'clave').subscribe();
      http.expectOne(`${BASE}/login`).flush({ token: 'abc', expiresAt: FUTURO });
      expect(auth.authenticated()).toBe(true);

      expect(() => auth.logout()).not.toThrow();
      expect(auth.authenticated()).toBe(false);
    });
  });

  describe('sesion guardada', () => {
    it('recupera una sesion vigente al arrancar', () => {
      const auth = crear({ token: 'abc', expiresAt: FUTURO });

      expect(auth.token()).toBe('abc');
      expect(auth.authenticated()).toBe(true);
    });

    it('descarta una sesion caducada', () => {
      const auth = crear({ token: 'abc', expiresAt: PASADO });

      expect(auth.token()).toBeNull();
    });

    it('descarta lo que no es una sesion valida', () => {
      for (const basura of ['{esto no es json', '[1,2,3]', '"texto"', { token: 5, expiresAt: FUTURO }, { token: '', expiresAt: FUTURO }, { token: 'abc' }]) {
        TestBed.resetTestingModule();
        expect(crear(basura).token(), JSON.stringify(basura)).toBeNull();
      }
    });

    it('un almacenamiento que lanza al leer no impide arrancar', () => {
      TestBed.resetTestingModule();
      storage = new FakeStorage();
      storage.fallar = true;
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AUTH_STORAGE, useValue: storage }],
      });
      http = TestBed.inject(HttpTestingController);

      expect(TestBed.inject(AuthService).token()).toBeNull();
    });

    it('sin almacenamiento disponible (servidor) funciona en memoria', () => {
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AUTH_STORAGE, useValue: null }],
      });
      http = TestBed.inject(HttpTestingController);
      const auth = TestBed.inject(AuthService);

      auth.login('dj', 'clave').subscribe();
      http.expectOne(`${BASE}/login`).flush({ token: 'abc', expiresAt: FUTURO });

      expect(auth.authenticated()).toBe(true);
    });
  });

  describe('ticket del stream', () => {
    it('lo pide al API y devuelve solo el ticket', () => {
      const auth = crear();
      let ticket: string | undefined;

      auth.streamTicket().subscribe((t) => (ticket = t));
      const peticion = http.expectOne(`${BASE}/stream-ticket`);
      expect(peticion.request.method).toBe('POST');
      peticion.flush({ ticket: 'tick.et.xyz', expiresAt: FUTURO });

      expect(ticket).toBe('tick.et.xyz');
    });
  });
});
