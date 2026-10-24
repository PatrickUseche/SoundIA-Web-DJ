import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WAKE_NOTICE_DELAY_MS, WakeNoticeService } from './wake-notice';
import { wakeNoticeInterceptor } from './wake-notice-interceptor';
import { environment } from '../../../environments/environment';

const API = environment.apiRootUrl;
const ESPERA = 8000;

describe('WakeNoticeService', () => {
  let aviso: WakeNoticeService;

  beforeEach(() => {
    vi.useFakeTimers();
    aviso = TestBed.inject(WakeNoticeService);
  });

  afterEach(() => vi.useRealTimers());

  it('empieza sin avisar', () => {
    expect(aviso.slow()).toBe(false);
  });

  it('una peticion rapida no avisa', () => {
    aviso.begin();
    vi.advanceTimersByTime(ESPERA - 1);
    aviso.end();
    vi.advanceTimersByTime(ESPERA * 2);

    expect(aviso.slow()).toBe(false);
  });

  it('una peticion que tarda mas del limite avisa', () => {
    aviso.begin();
    vi.advanceTimersByTime(ESPERA);

    expect(aviso.slow()).toBe(true);
  });

  it('el aviso se quita al terminar la peticion', () => {
    aviso.begin();
    vi.advanceTimersByTime(ESPERA);
    aviso.end();

    expect(aviso.slow()).toBe(false);
  });

  it('con varias peticiones el aviso sigue hasta que acaba la ultima', () => {
    aviso.begin();
    aviso.begin();
    vi.advanceTimersByTime(ESPERA);
    aviso.end();

    expect(aviso.slow()).toBe(true);

    aviso.end();
    expect(aviso.slow()).toBe(false);
  });

  it('una peticion nueva despues de avisar vuelve a empezar la cuenta', () => {
    aviso.begin();
    vi.advanceTimersByTime(ESPERA);
    aviso.end();

    aviso.begin();
    vi.advanceTimersByTime(ESPERA - 1);

    expect(aviso.slow()).toBe(false);
  });

  it('un end de mas no deja la cuenta en negativo', () => {
    aviso.end();
    aviso.begin();
    vi.advanceTimersByTime(ESPERA);

    expect(aviso.slow()).toBe(true);
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
  let aviso: WakeNoticeService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([wakeNoticeInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    aviso = TestBed.inject(WakeNoticeService);
  });

  afterEach(() => {
    backend.verify();
    vi.useRealTimers();
  });

  it('avisa si una peticion al API tarda y lo quita cuando responde', () => {
    http.get(`${API}/tracks`).subscribe();
    vi.advanceTimersByTime(ESPERA);
    expect(aviso.slow()).toBe(true);

    backend.expectOne(`${API}/tracks`).flush({});

    expect(aviso.slow()).toBe(false);
  });

  it('tambien lo quita si la peticion falla', () => {
    http.get(`${API}/tracks`).subscribe({ error: () => undefined });
    vi.advanceTimersByTime(ESPERA);

    backend.expectOne(`${API}/tracks`).flush('mal', { status: 502, statusText: 'Bad Gateway' });

    expect(aviso.slow()).toBe(false);
  });

  it('tambien lo quita si la peticion se cancela', () => {
    const suscripcion = http.get(`${API}/tracks`).subscribe();
    vi.advanceTimersByTime(ESPERA);

    suscripcion.unsubscribe();

    expect(aviso.slow()).toBe(false);
    backend.expectOne(`${API}/tracks`);
  });

  it('ignora las peticiones que no son del API', () => {
    http.get('https://otro-servidor.example/dato').subscribe();
    vi.advanceTimersByTime(ESPERA * 2);

    expect(aviso.slow()).toBe(false);
    backend.expectOne('https://otro-servidor.example/dato');
  });
});
