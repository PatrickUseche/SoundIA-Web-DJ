import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AUTH_STORAGE, AuthService } from './auth';
import { STREAM_RECONNECT_MS, TelemetryStreamService } from './telemetry-stream';
import { FakeEventSource, provideFakeEventSource } from '../testing/fake-event-source';
import { StreamEvent } from '../models/stream-messages';
import { environment } from '../../../environments/environment';

function setup(platform: 'browser' | 'server' = 'browser'): TelemetryStreamService {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: platform },
      provideFakeEventSource(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AUTH_STORAGE, useValue: null },
    ],
  });
  return TestBed.inject(TelemetryStreamService);
}

describe('TelemetryStreamService', () => {
  it('no abre ninguna conexion hasta que alguien se suscribe', () => {
    const service = setup();

    service.connect();

    expect(FakeEventSource.instances.length).toBe(0);
    expect(service.state()).toBe('closed');
  });

  it('se conecta a /stream del API Gateway y pasa a connecting', () => {
    const service = setup();

    service.connect().subscribe();

    expect(FakeEventSource.instances[0].url).toBe(`${environment.apiBaseUrl}/stream`);
    expect(service.state()).toBe('connecting');
  });

  it('pasa a open cuando la conexion se establece', () => {
    const service = setup();
    service.connect().subscribe();

    FakeEventSource.instances[0].open();

    expect(service.state()).toBe('open');
  });

  it('emite los eventos midi y decision ya parseados', () => {
    const service = setup();
    const recibidos: StreamEvent[] = [];
    service.connect().subscribe((e) => recibidos.push(e));
    const source = FakeEventSource.instances[0];

    source.emit('midi', '{"controlId":14,"value":127}');
    source.emit(
      'decision',
      '{"id":1,"controlId":14,"value":127,"status":"success","action":"Corte de EQ","createdIn":"2026-10-21T10:00:00"}',
    );

    expect(recibidos.map((e) => e.type)).toEqual(['midi', 'decision']);
    expect(recibidos[0].data).toEqual({ controlId: 14, value: 127 });
    expect((recibidos[1].data as { action: string }).action).toBe('Corte de EQ');
  });

  it('ignora un mensaje que no es JSON sin cortar el flujo', () => {
    const service = setup();
    const recibidos: StreamEvent[] = [];
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    service.connect().subscribe((e) => recibidos.push(e));
    const source = FakeEventSource.instances[0];

    source.emit('midi', 'esto no es json');
    source.emit('midi', '{"controlId":1,"value":2}');

    expect(recibidos.length).toBe(1);
    vi.restoreAllMocks();
  });

  it('un error con la conexion aun abierta se muestra como reconnecting', () => {
    const service = setup();
    service.connect().subscribe();
    const source = FakeEventSource.instances[0];

    source.fail(); // el navegador sigue reintentando

    expect(service.state()).toBe('reconnecting');
  });

  it('un error con la conexion cerrada para siempre se muestra como closed', () => {
    const service = setup();
    service.connect().subscribe();
    const source = FakeEventSource.instances[0];

    source.fail(true);

    expect(service.state()).toBe('closed');
  });

  it('al cancelar la suscripcion cierra el EventSource', () => {
    const service = setup();
    const subscription = service.connect().subscribe();
    const source = FakeEventSource.instances[0];
    source.open();

    subscription.unsubscribe();

    expect(source.closed).toBe(true);
    expect(service.state()).toBe('closed');
  });

  it('en el servidor no crea ninguna conexion y completa', () => {
    const service = setup('server');
    let completado = false;

    service.connect().subscribe({ complete: () => (completado = true) });

    expect(FakeEventSource.instances.length).toBe(0);
    expect(completado).toBe(true);
  });
});

describe('TelemetryStreamService con login', () => {
  const STATUS = `${environment.apiRootUrl}/auth/status`;
  const TICKET = `${environment.apiRootUrl}/auth/stream-ticket`;
  let backend: HttpTestingController;

  /** Prepara el servicio sabiendo ya que el API exige login (o que no). */
  function conLogin(exige: boolean): TelemetryStreamService {
    const service = setup();
    backend = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).status().subscribe();
    backend.expectOne(STATUS).flush({ enabled: exige });
    return service;
  }

  const darTicket = (ticket: string) => backend.expectOne(TICKET).flush({ ticket, expiresAt: '2999-01-01T00:00:00Z' });

  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    backend?.verify();
    vi.useRealTimers();
  });

  it('pide un ticket y abre el stream con el en la direccion', () => {
    const service = conLogin(true);

    service.connect().subscribe();
    expect(FakeEventSource.instances.length).toBe(0);
    darTicket('tick.et.1');

    expect(FakeEventSource.instances[0].url).toBe(`${environment.apiBaseUrl}/stream?ticket=tick.et.1`);
    expect(service.state()).toBe('connecting');
  });

  it('el ticket se codifica para ir en una direccion', () => {
    const service = conLogin(true);

    service.connect().subscribe();
    darTicket('a+b/c=d');

    expect(FakeEventSource.instances[0].url).toBe(`${environment.apiBaseUrl}/stream?ticket=a%2Bb%2Fc%3Dd`);
  });

  it('sin login no pide ningun ticket y abre el stream como siempre', () => {
    const service = conLogin(false);

    service.connect().subscribe();

    backend.expectNone(TICKET);
    expect(FakeEventSource.instances[0].url).toBe(`${environment.apiBaseUrl}/stream`);
  });

  it('emite los eventos igual que sin login', () => {
    const service = conLogin(true);
    const recibidos: StreamEvent[] = [];
    service.connect().subscribe((e) => recibidos.push(e));
    darTicket('t');

    FakeEventSource.instances[0].open();
    FakeEventSource.instances[0].emit('midi', '{"controlId":14,"value":127}');

    expect(service.state()).toBe('open');
    expect(recibidos.map((e) => e.type)).toEqual(['midi']);
  });

  it('si se corta la conexion la cierra y, pasado un momento, pide un ticket nuevo y reabre', async () => {
    const service = conLogin(true);
    service.connect().subscribe();
    darTicket('viejo');
    const primera = FakeEventSource.instances[0];
    primera.open();

    primera.fail(); // el navegador reintentaria con el ticket viejo, que ya habria vencido

    expect(primera.closed).toBe(true);
    expect(service.state()).toBe('reconnecting');
    backend.expectNone(TICKET);

    await vi.advanceTimersByTimeAsync(STREAM_RECONNECT_MS);
    darTicket('nuevo');

    expect(FakeEventSource.instances.length).toBe(2);
    expect(FakeEventSource.instances[1].url).toBe(`${environment.apiBaseUrl}/stream?ticket=nuevo`);
  });

  it('un error al pedir el ticket (el API no responde) reintenta pasado un momento', async () => {
    const service = conLogin(true);
    service.connect().subscribe();

    backend.expectOne(TICKET).flush('error', { status: 503, statusText: 'Unavailable' });
    expect(service.state()).toBe('reconnecting');

    await vi.advanceTimersByTimeAsync(STREAM_RECONNECT_MS);
    darTicket('t');

    expect(FakeEventSource.instances.length).toBe(1);
  });

  it('un 401 al pedir el ticket no se reintenta: la sesion ya no vale', async () => {
    const service = conLogin(true);
    service.connect().subscribe();

    backend.expectOne(TICKET).flush({}, { status: 401, statusText: 'Unauthorized' });
    await vi.advanceTimersByTimeAsync(STREAM_RECONNECT_MS * 3);

    expect(service.state()).toBe('closed');
    backend.expectNone(TICKET);
    expect(FakeEventSource.instances.length).toBe(0);
  });

  it('al cancelar la suscripcion cierra la conexion y no reabre', async () => {
    const service = conLogin(true);
    const subscription = service.connect().subscribe();
    darTicket('t');
    const source = FakeEventSource.instances[0];

    subscription.unsubscribe();
    await vi.advanceTimersByTimeAsync(STREAM_RECONNECT_MS * 3);

    expect(source.closed).toBe(true);
    expect(service.state()).toBe('closed');
    backend.expectNone(TICKET);
  });

  it('cancelar mientras espera para reconectar evita la reconexion', async () => {
    const service = conLogin(true);
    const subscription = service.connect().subscribe();
    darTicket('t');
    FakeEventSource.instances[0].fail();

    subscription.unsubscribe();
    await vi.advanceTimersByTimeAsync(STREAM_RECONNECT_MS * 3);

    backend.expectNone(TICKET);
    expect(FakeEventSource.instances.length).toBe(1);
  });

  it('cancelar con el ticket aun sin llegar no abre ninguna conexion despues', () => {
    const service = conLogin(true);
    const subscription = service.connect().subscribe();

    subscription.unsubscribe();

    expect(backend.expectOne(TICKET).cancelled).toBe(true);
    expect(FakeEventSource.instances.length).toBe(0);
  });
});
