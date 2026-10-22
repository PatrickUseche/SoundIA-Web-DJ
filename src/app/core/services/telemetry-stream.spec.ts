import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { TelemetryStreamService } from './telemetry-stream';
import { FakeEventSource, provideFakeEventSource } from '../testing/fake-event-source';
import { StreamEvent } from '../models/stream-messages';
import { environment } from '../../../environments/environment';

function setup(platform: 'browser' | 'server' = 'browser'): TelemetryStreamService {
  TestBed.configureTestingModule({
    providers: [{ provide: PLATFORM_ID, useValue: platform }, provideFakeEventSource()],
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
