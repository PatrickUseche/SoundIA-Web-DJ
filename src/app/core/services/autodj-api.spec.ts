import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AutoDjApiService } from './autodj-api';
import { SessionsApiService } from './sessions-api';
import { DjSession, NextTracksResponse, QueueItem, TransitionPlan } from '../models/autodj';
import { environment } from '../../../environments/environment';

const ROOT = environment.apiRootUrl;

const sesion = (cambios: Partial<DjSession> = {}): DjSession => ({
  id: 1, name: 'Viernes', startedAt: '2026-10-21T20:00:00', endedAt: null, active: true, ...cambios,
});

describe('AutoDjApiService', () => {
  let service: AutoDjApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AutoDjApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('nextTracks hace POST con el id y el limite', () => {
    let respuesta: NextTracksResponse | undefined;

    service.nextTracks(7, 3).subscribe((r) => (respuesta = r));

    const req = http.expectOne(`${ROOT}/autodj/next`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ trackId: 7, limit: 3 });
    req.flush({ current: { id: 7 }, candidates: [] });
    expect(respuesta?.current.id).toBe(7);
  });

  it('nextTracks sin limite no envia el campo', () => {
    service.nextTracks(7).subscribe();

    expect(http.expectOne(`${ROOT}/autodj/next`).request.body).toEqual({ trackId: 7 });
  });

  it('transition hace POST con los dos ids y devuelve el plan', () => {
    let plan: TransitionPlan | undefined;

    service.transition(1, 2).subscribe((p) => (plan = p));

    const req = http.expectOne(`${ROOT}/autodj/transition`);
    expect(req.request.body).toEqual({ fromTrackId: 1, toTrackId: 2 });
    req.flush({ style: 'blend', bars: 16, seconds: 30, automation: [] });
    expect(plan?.style).toBe('blend');
    expect(plan?.bars).toBe(16);
  });
});

describe('SessionsApiService', () => {
  let service: SessionsApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(SessionsApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('start inicia una sesion con su nombre', () => {
    let creada: DjSession | undefined;

    service.start('Viernes').subscribe((s) => (creada = s));

    const req = http.expectOne(`${ROOT}/sessions`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Viernes' });
    req.flush(sesion());
    expect(creada?.id).toBe(1);
  });

  it('end cierra una sesion', () => {
    service.end(5).subscribe();

    const req = http.expectOne(`${ROOT}/sessions/5/end`);
    expect(req.request.method).toBe('POST');
    req.flush(sesion({ id: 5, active: false }));
  });

  it('active devuelve la sesion abierta', () => {
    let activa: DjSession | null | undefined;

    service.active().subscribe((s) => (activa = s));

    http.expectOne(`${ROOT}/sessions/active`).flush(sesion({ id: 3 }));
    expect(activa?.id).toBe(3);
  });

  it('active devuelve null si no hay sesion abierta (404)', () => {
    let activa: DjSession | null | undefined;

    service.active().subscribe((s) => (activa = s));

    http.expectOne(`${ROOT}/sessions/active`).flush({ error: 'No hay ninguna sesion abierta.' }, { status: 404, statusText: 'Not Found' });
    expect(activa).toBeNull();
  });

  it('active propaga los demas errores', () => {
    let error: unknown;

    service.active().subscribe({ error: (e) => (error = e) });

    http.expectOne(`${ROOT}/sessions/active`).flush({}, { status: 500, statusText: 'Server Error' });
    expect((error as { status: number }).status).toBe(500);
  });

  it('list pide las sesiones recientes', () => {
    service.list().subscribe();

    expect(http.expectOne(`${ROOT}/sessions`).request.method).toBe('GET');
  });

  it('queue pide la cola de una sesion', () => {
    let cola: QueueItem[] | undefined;

    service.queue(4).subscribe((c) => (cola = c));

    http.expectOne(`${ROOT}/sessions/4/queue`).flush([{ id: 1, sessionId: 4, trackId: 10, addedAt: 'x' }]);
    expect(cola?.[0].trackId).toBe(10);
  });

  it('enqueue agrega una pista a la cola', () => {
    service.enqueue(4, 10).subscribe();

    const req = http.expectOne(`${ROOT}/sessions/4/queue`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ trackId: 10 });
    req.flush({ id: 1, sessionId: 4, trackId: 10, addedAt: 'x' });
  });

  it('pollNext saca la siguiente pista de la cola', () => {
    service.pollNext(4).subscribe();

    const req = http.expectOne(`${ROOT}/sessions/4/queue/next`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 1, sessionId: 4, trackId: 10, addedAt: 'x' });
  });

  it('removeFromQueue borra un elemento de la cola', () => {
    service.removeFromQueue(4, 9).subscribe();

    const req = http.expectOne(`${ROOT}/sessions/4/queue/9`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});
