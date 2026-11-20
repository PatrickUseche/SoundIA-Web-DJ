import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WAKE_NOTICE_DELAY_MS, WakeNoticeService } from './wake-notice';
import { wakeNoticeInterceptor } from './wake-notice-interceptor';
import { environment } from '../../../environments/environment';

const API = environment.apiRootUrl;
const ESPERA = 8000;

describe('WakeNoticeService', () => {
  let noticeText: WakeNoticeService;

  beforeEach(() => {
    vi.useFakeTimers();
    noticeText = TestBed.inject(WakeNoticeService);
  });

  afterEach(() => vi.useRealTimers());

  it('empieza sin avisar', () => {
    expect(noticeText.slow()).toBe(false);
  });

  it('una peticion rapida no avisa', () => {
    noticeText.begin();
    vi.advanceTimersByTime(ESPERA - 1);
    noticeText.end();
    vi.advanceTimersByTime(ESPERA * 2);

    expect(noticeText.slow()).toBe(false);
  });

  it('una peticion que tarda mas del limite avisa', () => {
    noticeText.begin();
    vi.advanceTimersByTime(ESPERA);

    expect(noticeText.slow()).toBe(true);
  });

  it('el aviso se quita al terminar la peticion', () => {
    noticeText.begin();
    vi.advanceTimersByTime(ESPERA);
    noticeText.end();

    expect(noticeText.slow()).toBe(false);
  });

  it('con varias peticiones el aviso sigue hasta que acaba la ultima', () => {
    noticeText.begin();
    noticeText.begin();
    vi.advanceTimersByTime(ESPERA);
    noticeText.end();

    expect(noticeText.slow()).toBe(true);

    noticeText.end();
    expect(noticeText.slow()).toBe(false);
  });

  it('una peticion nueva despues de avisar vuelve a empezar la cuenta', () => {
    noticeText.begin();
    vi.advanceTimersByTime(ESPERA);
    noticeText.end();

    noticeText.begin();
    vi.advanceTimersByTime(ESPERA - 1);

    expect(noticeText.slow()).toBe(false);
  });

  it('un end de mas no deja la cuenta en negativo', () => {
    noticeText.end();
    noticeText.begin();
    vi.advanceTimersByTime(ESPERA);

    expect(noticeText.slow()).toBe(true);
  });

  it('el limite se puede cambiar', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: WAKE_NOTICE_DELAY_MS, useValue: 1000 }] });
    const rapido = TestBed.inject(WakeNoticeService);

    rapido.begin();
    vi.advanceTimersByTime(1000);

    expect(rapido.slow()).toBe(true);
  });
});

describe('wakeNoticeInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let noticeText: WakeNoticeService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([wakeNoticeInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    noticeText = TestBed.inject(WakeNoticeService);
  });

  afterEach(() => {
    backend.verify();
    vi.useRealTimers();
  });

  it('avisa si una peticion al API tarda y lo quita cuando responde', () => {
    http.get(`${API}/tracks`).subscribe();
    vi.advanceTimersByTime(ESPERA);
    expect(noticeText.slow()).toBe(true);

    backend.expectOne(`${API}/tracks`).flush({});

    expect(noticeText.slow()).toBe(false);
  });

  it('tambien lo quita si la peticion falla', () => {
    http.get(`${API}/tracks`).subscribe({ error: () => undefined });
    vi.advanceTimersByTime(ESPERA);

    backend.expectOne(`${API}/tracks`).flush('mal', { status: 502, statusText: 'Bad Gateway' });

    expect(noticeText.slow()).toBe(false);
  });

  it('tambien lo quita si la peticion se cancela', () => {
    const suscripcion = http.get(`${API}/tracks`).subscribe();
    vi.advanceTimersByTime(ESPERA);

    suscripcion.unsubscribe();

    expect(noticeText.slow()).toBe(false);
    backend.expectOne(`${API}/tracks`);
  });

  it('al responder el API queda marcado como alcanzable', () => {
    expect(noticeText.reachable()).toBeNull();

    http.get(`${API}/tracks`).subscribe();
    backend.expectOne(`${API}/tracks`).flush({});

    expect(noticeText.reachable()).toBe(true);
  });

  it('un 401 o un 404 tambien son respuestas del servidor: esta alcanzable', () => {
    for (const status of [401, 404, 422]) {
      http.get(`${API}/tracks`).subscribe({ error: () => undefined });
      backend.expectOne(`${API}/tracks`).flush('x', { status, statusText: 'x' });

      expect(noticeText.reachable(), `codigo ${status}`).toBe(true);
    }
  });

  it('un 502, 503, 504 o la falta de conexion lo marcan como no alcanzable', () => {
    for (const status of [502, 503, 504, 0]) {
      http.get(`${API}/tracks`).subscribe({ error: () => undefined });
      backend.expectOne(`${API}/tracks`).flush('x', { status, statusText: 'x' });

      expect(noticeText.reachable(), `codigo ${status}`).toBe(false);
    }
  });

  it('vuelve a alcanzable en cuanto responde otra vez', () => {
    http.get(`${API}/tracks`).subscribe({ error: () => undefined });
    backend.expectOne(`${API}/tracks`).flush('x', { status: 502, statusText: 'Bad Gateway' });
    expect(noticeText.reachable()).toBe(false);

    http.get(`${API}/tracks`).subscribe();
    backend.expectOne(`${API}/tracks`).flush({});

    expect(noticeText.reachable()).toBe(true);
  });

  it('ignora las peticiones que no son del API', () => {
    http.get('https://otro-servidor.example/dato').subscribe();
    vi.advanceTimersByTime(ESPERA * 2);

    expect(noticeText.slow()).toBe(false);
    backend.expectOne('https://otro-servidor.example/dato');
  });
});
