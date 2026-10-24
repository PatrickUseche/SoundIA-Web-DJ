import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AuthService } from './auth';
import { KEEP_ALIVE_CLOCK, KEEP_ALIVE_IDLE_MS, KEEP_ALIVE_MS, KeepAliveService } from './keep-alive';
import { TrackApiService } from './tracks';

const CADA = 4 * 60 * 1000;
const INACTIVO = 2 * 60 * 60 * 1000;

describe('KeepAliveService', () => {
  let ahora: number;
  let list: ReturnType<typeof vi.fn>;
  let enabled: ReturnType<typeof signal<boolean | null>>;
  let authenticated: ReturnType<typeof signal<boolean>>;

  /** Pasa el tiempo (el del reloj de pruebas y el de los temporizadores). */
  function pasar(ms: number) {
    ahora += ms;
    vi.advanceTimersByTime(ms);
  }

  function crear(): KeepAliveService {
    return TestBed.inject(KeepAliveService);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    ahora = 1_000_000;
    list = vi.fn(() => of([]));
    enabled = signal<boolean | null>(false);
    authenticated = signal(false);
    TestBed.configureTestingModule({
      providers: [
        { provide: TrackApiService, useValue: { list } },
        { provide: AuthService, useValue: { enabled, authenticated } },
        { provide: KEEP_ALIVE_CLOCK, useValue: () => ahora },
      ],
    });
  });

  afterEach(() => {
    TestBed.inject(KeepAliveService).stop();
    vi.useRealTimers();
  });

  it('no hace nada hasta que se le pide empezar', () => {
    crear();

    pasar(CADA * 3);

    expect(list).not.toHaveBeenCalled();
  });

  it('una vez empezado, consulta la lista de pistas cada pocos minutos', () => {
    crear().start();

    pasar(CADA - 1);
    expect(list).not.toHaveBeenCalled();
    pasar(1);
    expect(list).toHaveBeenCalledTimes(1);
    pasar(CADA);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('es seguro llamarlo varias veces: no se duplican las consultas', () => {
    const servicio = crear();
    servicio.start();
    servicio.start();

    pasar(CADA);

    expect(list).toHaveBeenCalledTimes(1);
  });

  it('con el login encendido y sin sesion iniciada no consulta (daria 401 y cerraria la sesion)', () => {
    enabled.set(true);
    authenticated.set(false);
    crear().start();

    pasar(CADA * 2);

    expect(list).not.toHaveBeenCalled();
  });

  it('con el login encendido y la sesion iniciada si consulta', () => {
    enabled.set(true);
    authenticated.set(true);
    crear().start();

    pasar(CADA);

    expect(list).toHaveBeenCalledTimes(1);
  });

  it('mientras no se sabe si el login esta encendido no consulta', () => {
    enabled.set(null);
    crear().start();

    pasar(CADA);

    expect(list).not.toHaveBeenCalled();
  });

  it('si la consulta falla no rompe nada y sigue intentando', () => {
    list.mockReturnValue(throwError(() => new Error('sin red')));
    crear().start();

    pasar(CADA * 2);

    expect(list).toHaveBeenCalledTimes(2);
  });

  it('deja de insistir si nadie toca la pagina durante horas, para no gastar las horas gratuitas', () => {
    crear().start();

    // Paso a paso: el reloj de pruebas y los temporizadores deben avanzar juntos, no de golpe.
    for (let transcurrido = 0; transcurrido <= INACTIVO + CADA; transcurrido += CADA) {
      pasar(CADA);
    }
    const total = list.mock.calls.length;
    expect(total).toBeGreaterThan(0); // mientras hubo actividad reciente si insistio

    pasar(CADA * 5);

    expect(list.mock.calls.length).toBe(total);
  });

  it('cualquier actividad del usuario reinicia la cuenta de inactividad', () => {
    crear().start();
    pasar(INACTIVO - CADA);

    window.dispatchEvent(new Event('pointerdown'));
    const antes = list.mock.calls.length;
    pasar(CADA * 3);

    expect(list.mock.calls.length).toBe(antes + 3);
  });

  it('el teclado tambien cuenta como actividad', () => {
    crear().start();
    pasar(INACTIVO - CADA);

    window.dispatchEvent(new Event('keydown'));
    const antes = list.mock.calls.length;
    pasar(CADA);

    expect(list.mock.calls.length).toBe(antes + 1);
  });

  it('al pararlo deja de consultar', () => {
    const servicio = crear();
    servicio.start();
    pasar(CADA);
    expect(list).toHaveBeenCalledTimes(1);

    servicio.stop();
    pasar(CADA * 3);

    expect(list).toHaveBeenCalledTimes(1);
  });

  it('los tiempos se pueden configurar', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: TrackApiService, useValue: { list } },
        { provide: AuthService, useValue: { enabled, authenticated } },
        { provide: KEEP_ALIVE_CLOCK, useValue: () => ahora },
        { provide: KEEP_ALIVE_MS, useValue: 1000 },
        { provide: KEEP_ALIVE_IDLE_MS, useValue: 5000 },
      ],
    });
    crear().start();

    pasar(1000);
    expect(list).toHaveBeenCalledTimes(1);
    pasar(10_000);
    const total = list.mock.calls.length;
    expect(total).toBeLessThanOrEqual(5);
    pasar(10_000);
    expect(list.mock.calls.length).toBe(total);
  });
});
