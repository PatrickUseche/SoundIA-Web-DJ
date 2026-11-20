import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth';
import { ENGINE_STATUS_POLL_MS, EngineStatusService } from './engine-status';

const URL = `${environment.apiRootUrl}/engine/status`;
const CADA = 30_000;

function reply(state: string) {
  return { state, consecutiveFailures: 0, lastSuccessAt: null, lastFailureAt: null, lastError: null };
}

describe('EngineStatusService', () => {
  let http: HttpTestingController;
  let enabled: ReturnType<typeof signal<boolean | null>>;
  let authenticated: ReturnType<typeof signal<boolean>>;

  function crear(): EngineStatusService {
    return TestBed.inject(EngineStatusService);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    enabled = signal<boolean | null>(false);
    authenticated = signal(false);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { enabled, authenticated } },
        { provide: ENGINE_STATUS_POLL_MS, useValue: CADA },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    TestBed.inject(EngineStatusService).stop();
    vi.useRealTimers();
  });

  it('no sabe nada del motor hasta que se le pide empezar', () => {
    const servicio = crear();

    TestBed.tick();
    http.expectNone(URL);
    expect(servicio.state()).toBeNull();
  });

  it('consulta nada mas empezar y muestra el estado que informa el API', () => {
    const servicio = crear();
    servicio.start();
    TestBed.tick();

    http.expectOne(URL).flush(reply('UP'));

    expect(servicio.state()).toBe('UP');
  });

  it('vuelve a consultar cada cierto tiempo y refleja que el motor se cayo', () => {
    const servicio = crear();
    servicio.start();
    TestBed.tick();
    http.expectOne(URL).flush(reply('UP'));

    vi.advanceTimersByTime(CADA);
    http.expectOne(URL).flush(reply('DOWN'));

    expect(servicio.state()).toBe('DOWN');
  });

  it('si el API no responde se olvida el ultimo estado en vez de mostrar uno viejo', () => {
    const servicio = crear();
    servicio.start();
    TestBed.tick();
    http.expectOne(URL).flush(reply('UP'));

    vi.advanceTimersByTime(CADA);
    http.expectOne(URL).error(new ProgressEvent('error'));

    expect(servicio.state()).toBeNull();
  });

  it('con el login encendido y sin sesion no consulta (daria 401)', () => {
    enabled.set(true);
    const servicio = crear();
    servicio.start();
    TestBed.tick();
    vi.advanceTimersByTime(CADA * 2);

    http.expectNone(URL);
    expect(servicio.state()).toBeNull();
  });

  it('al iniciar sesion consulta enseguida', () => {
    enabled.set(true);
    const servicio = crear();
    servicio.start();
    TestBed.tick();

    authenticated.set(true);
    TestBed.tick();

    http.expectOne(URL).flush(reply('UNKNOWN'));
    expect(servicio.state()).toBe('UNKNOWN');
  });

  it('con la pestana oculta no gasta peticiones', () => {
    const servicio = crear();
    servicio.start();
    TestBed.tick();
    http.expectOne(URL).flush(reply('UP'));
    const oculto = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);

    vi.advanceTimersByTime(CADA * 3);

    http.expectNone(URL);
    oculto.mockRestore();
  });
});
