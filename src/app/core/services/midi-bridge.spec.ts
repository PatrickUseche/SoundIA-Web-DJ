import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MidiBridgeService } from './midi-bridge';
import { MidiService } from './midi';
import { FakeMidiAccess, FakeMidiInput, provideFakeMidi } from '../testing/fake-midi';
import { environment } from '../../../environments/environment';

const EVENT_URL = `${environment.apiBaseUrl}/event`;

describe('MidiBridgeService', () => {
  let bridge: MidiBridgeService;
  let http: HttpTestingController;
  let controlador: FakeMidiInput;

  beforeEach(async () => {
    vi.useFakeTimers();
    controlador = new FakeMidiInput('ddj');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideFakeMidi(new FakeMidiAccess([controlador])),
      ],
    });
    bridge = TestBed.inject(MidiBridgeService);
    http = TestBed.inject(HttpTestingController);
    await TestBed.inject(MidiService).requestAccess();
  });

  afterEach(() => {
    bridge.stop();
    http.verify();
    vi.useRealTimers();
  });

  const avanzar = (ms: number) => vi.advanceTimersByTime(ms);
  const aceptar = (req: ReturnType<HttpTestingController['expectOne']>) => req.flush('Evento MIDI procesado.');

  it('no envia nada mientras no se inicia', () => {
    controlador.send(0xb0, 14, 100);
    avanzar(500);

    http.expectNone(EVENT_URL);
    expect(bridge.active()).toBe(false);
  });

  it('envia un movimiento del controlador al API', () => {
    bridge.start();

    controlador.send(0xb0, 14, 100);
    avanzar(50);

    const req = http.expectOne(EVENT_URL);
    expect(req.request.body).toEqual({ controlId: 14, value: 100 });
    aceptar(req);
    expect(bridge.sent()).toBe(1);
  });

  it('una rafaga de movimientos del mismo control envia solo el ultimo valor', () => {
    bridge.start();

    for (let valor = 0; valor < 100; valor++) {
      controlador.send(0xb0, 14, valor);
    }
    avanzar(50);

    const req = http.expectOne(EVENT_URL);
    expect(req.request.body).toEqual({ controlId: 14, value: 99 });
    aceptar(req);
  });

  it('controles distintos se envian por separado', () => {
    bridge.start();

    controlador.send(0xb0, 14, 10);
    controlador.send(0xb0, 15, 20);
    avanzar(50);

    const cuerpos = http.match(EVENT_URL).map((req) => {
      aceptar(req);
      return req.request.body;
    });
    expect(cuerpos).toEqual([
      { controlId: 14, value: 10 },
      { controlId: 15, value: 20 },
    ]);
  });

  it('los movimientos separados por mas de la ventana se envian todos', () => {
    bridge.start();

    controlador.send(0xb0, 14, 10);
    avanzar(50);
    aceptar(http.expectOne(EVENT_URL));
    controlador.send(0xb0, 14, 20);
    avanzar(50);
    aceptar(http.expectOne(EVENT_URL));

    expect(bridge.sent()).toBe(2);
  });

  it('un valor nuevo no se envia hasta que termina el envio anterior del mismo control', () => {
    bridge.start();
    controlador.send(0xb0, 14, 10);
    avanzar(50);
    const primero = http.expectOne(EVENT_URL);

    controlador.send(0xb0, 14, 20);
    avanzar(50);
    http.expectNone(EVENT_URL); // el primero sigue en vuelo

    aceptar(primero);
    const segundo = http.expectOne(EVENT_URL);
    expect(segundo.request.body).toEqual({ controlId: 14, value: 20 });
    aceptar(segundo);
  });

  it('un fallo del API se cuenta y no corta los envios siguientes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    bridge.start();

    controlador.send(0xb0, 14, 10);
    avanzar(50);
    http.expectOne(EVENT_URL).flush('error', { status: 500, statusText: 'Server Error' });
    controlador.send(0xb0, 14, 20);
    avanzar(50);
    aceptar(http.expectOne(EVENT_URL));

    expect(bridge.failed()).toBe(1);
    expect(bridge.sent()).toBe(1);
    vi.restoreAllMocks();
  });

  it('start dos veces no duplica los envios', () => {
    bridge.start();
    bridge.start();

    controlador.send(0xb0, 14, 10);
    avanzar(50);

    aceptar(http.expectOne(EVENT_URL));
  });

  it('stop deja de enviar', () => {
    bridge.start();
    bridge.stop();

    controlador.send(0xb0, 14, 10);
    avanzar(100);

    http.expectNone(EVENT_URL);
    expect(bridge.active()).toBe(false);
  });

  it('se puede volver a iniciar tras detenerlo', () => {
    bridge.start();
    bridge.stop();
    bridge.start();

    controlador.send(0xb0, 14, 10);
    avanzar(50);

    aceptar(http.expectOne(EVENT_URL));
    expect(bridge.active()).toBe(true);
  });

  it('resetCounters pone los contadores en cero', () => {
    bridge.start();
    controlador.send(0xb0, 14, 10);
    avanzar(50);
    aceptar(http.expectOne(EVENT_URL));

    bridge.resetCounters();

    expect(bridge.sent()).toBe(0);
    expect(bridge.failed()).toBe(0);
  });
});
