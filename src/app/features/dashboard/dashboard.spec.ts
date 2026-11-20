import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DashboardComponent } from './dashboard';
import { FakeEventSource, provideFakeEventSource } from '../../core/testing/fake-event-source';
import { environment } from '../../../environments/environment';

const BASE_URL = environment.apiBaseUrl;

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideFakeEventSource()],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should create', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE_URL}/logs`).flush([]);

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('carga el historial al iniciar y lo muestra en la lista', async () => {
    fixture.detectChanges();
    http.expectOne(`${BASE_URL}/logs`).flush([
      { id: 1, controlId: 14, value: 127, createdIn: '2026-10-21T10:00:00' },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();

    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('li');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('14');
    expect(items[0].textContent).toContain('127');
  });

  it('muestra el estado y la accion de la decision tras disparar el evento', async () => {
    fixture.detectChanges();
    http.expectOne(`${BASE_URL}/logs`).flush([]);

    fixture.componentInstance.simulateAutoMix();
    const req = http.expectOne(`${BASE_URL}/ai/predict`);
    expect(req.request.body).toEqual({ controlId: 14, value: 127 });
    req.flush({ status: 'success', action: 'Corte de EQ en deck 14' });
    http.expectOne(`${BASE_URL}/logs`).flush([]);
    await fixture.whenStable();
    fixture.detectChanges();

    const bodyText = (fixture.nativeElement as HTMLElement).textContent;
    expect(bodyText).toContain('success');
    expect(bodyText).toContain('Corte de EQ en deck 14');
    expect(bodyText).not.toContain('[object Object]');
  });

  it('refresca el historial despues de disparar el evento', async () => {
    fixture.detectChanges();
    http.expectOne(`${BASE_URL}/logs`).flush([]);

    fixture.componentInstance.simulateAutoMix();
    http.expectOne(`${BASE_URL}/ai/predict`).flush({ status: 'success', action: 'Corte de EQ' });
    http.expectOne(`${BASE_URL}/logs`).flush([
      { id: 7, controlId: 14, value: 127, createdIn: '2026-10-21T10:05:00' },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelectorAll('li').length).toBe(1);
  });

  it('muestra la accion de la IA de cada evento del historial y marca los que no la tuvieron', async () => {
    fixture.detectChanges();
    http.expectOne(`${BASE_URL}/logs`).flush([
      { id: 2, controlId: 14, value: 127, action: 'Corte de EQ en deck 14', createdIn: '2026-10-21T10:00:00' },
      { id: 1, controlId: 15, value: 64, action: null, createdIn: '2026-10-21T09:59:00' },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();

    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('li');
    expect(items[0].textContent).toContain('Corte de EQ en deck 14');
    expect(items[1].textContent).toContain('Sin decisión de la IA');
  });

  describe('estados de carga y error', () => {
    const bodyText = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => vi.restoreAllMocks());

    it('muestra un indicador mientras carga el historial', () => {
      fixture.detectChanges();

      expect(bodyText()).toContain('Cargando historial');
      http.expectOne(`${BASE_URL}/logs`).flush([]);
    });

    it('muestra un estado vacio cuando no hay eventos', async () => {
      fixture.detectChanges();
      http.expectOne(`${BASE_URL}/logs`).flush([]);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(bodyText()).not.toContain('Cargando historial');
      expect(bodyText()).toContain('Sin eventos registrados');
    });

    it('muestra un error si falla la carga del historial', async () => {
      fixture.detectChanges();
      http
        .expectOne(`${BASE_URL}/logs`)
        .flush('fallo', { status: 500, statusText: 'Internal Server Error' });
      await fixture.whenStable();
      fixture.detectChanges();

      const alerta = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
      expect(alerta?.textContent).toContain('No se pudo cargar el historial');
      expect(bodyText()).not.toContain('Sin eventos registrados');
    });

    it('deshabilita el boton mientras se calcula la mezcla', () => {
      fixture.detectChanges();
      http.expectOne(`${BASE_URL}/logs`).flush([]);
      const boton = (fixture.nativeElement as HTMLElement).querySelector('button')!;

      boton.click();
      fixture.detectChanges();

      expect(boton.disabled).toBe(true);
      http.expectOne(`${BASE_URL}/ai/predict`).flush({ status: 'success', action: 'x' });
      http.expectOne(`${BASE_URL}/logs`).flush([]);
    });

    it('muestra un error si falla el calculo de la mezcla y reactiva el boton', async () => {
      fixture.detectChanges();
      http.expectOne(`${BASE_URL}/logs`).flush([]);
      const boton = (fixture.nativeElement as HTMLElement).querySelector('button')!;

      boton.click();
      http
        .expectOne(`${BASE_URL}/ai/predict`)
        .flush('fallo', { status: 502, statusText: 'Bad Gateway' });
      await fixture.whenStable();
      fixture.detectChanges();

      const alerta = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
      expect(alerta?.textContent).toContain('No se pudo calcular la mezcla');
      expect(boton.disabled).toBe(false);
    });
  });

  it('incluye el panel del controlador MIDI', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE_URL}/logs`).flush([]);

    expect((fixture.nativeElement as HTMLElement).querySelector('app-midi-panel')).not.toBeNull();
  });

  describe('en vivo (SSE)', () => {
    const el = () => fixture.nativeElement as HTMLElement;
    const bodyText = () => el().textContent ?? '';

    async function iniciar(historial: unknown[] = []) {
      fixture.detectChanges();
      http.expectOne(`${BASE_URL}/logs`).flush(historial);
      await fixture.whenStable();
      fixture.detectChanges();
    }

    async function emitir(tipo: 'midi' | 'decision', datos: object) {
      FakeEventSource.last.emit(tipo, JSON.stringify(datos));
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it('abre la conexion en vivo al iniciar', async () => {
      await iniciar();

      expect(FakeEventSource.instances.length).toBe(1);
      expect(FakeEventSource.last.url).toBe(`${BASE_URL}/stream`);
    });

    it('cierra la conexion al destruir el componente', async () => {
      await iniciar();

      fixture.destroy();

      expect(FakeEventSource.last.closed).toBe(true);
    });

    it('muestra el estado de la conexion', async () => {
      await iniciar();
      expect(el().querySelector('[role="status"]')?.textContent).toContain('Conectando');

      FakeEventSource.last.open();
      fixture.detectChanges();
      expect(el().querySelector('[role="status"]')?.textContent).toContain('En vivo');

      FakeEventSource.last.fail();
      fixture.detectChanges();
      expect(el().querySelector('[role="status"]')?.textContent).toContain('Reconectando');

      FakeEventSource.last.fail(true);
      fixture.detectChanges();
      expect(el().querySelector('[role="status"]')?.textContent).toContain('Sin conexión en vivo');
    });

    it('muestra en el feed cada evento MIDI que llega', async () => {
      await iniciar();

      await emitir('midi', { controlId: 14, value: 127 });

      const feed = el().querySelector('[aria-live="polite"]');
      expect(feed?.textContent).toContain('Control 14');
      expect(feed?.textContent).toContain('127');
    });

    it('agrega al historial la decision que llega sin pedirlo otra vez al API', async () => {
      await iniciar();

      await emitir('decision', {
        id: 5, controlId: 14, value: 127, status: 'success',
        action: 'Corte de EQ en deck 14', createdIn: '2026-10-21T10:00:00',
      });

      expect(el().querySelectorAll('li.historial').length).toBe(1);
      expect(bodyText()).toContain('Corte de EQ en deck 14');
      http.expectNone(`${BASE_URL}/logs`);
    });

    it('muestra la ultima decision de la IA en su panel', async () => {
      await iniciar();

      await emitir('decision', {
        id: 5, controlId: 14, value: 127, status: 'success',
        action: 'Corte de EQ en deck 14', createdIn: '2026-10-21T10:00:00',
      });

      expect(fixture.componentInstance.latestDecision()).toEqual({
        status: 'success', action: 'Corte de EQ en deck 14',
      });
    });

    it('una decision unavailable queda sin accion', async () => {
      await iniciar();

      await emitir('decision', {
        id: 6, controlId: 15, value: 64, status: 'unavailable',
        action: null, createdIn: '2026-10-21T10:01:00',
      });

      expect(bodyText()).toContain('unavailable');
      expect(bodyText()).toContain('Sin decisión de la IA');
    });

    it('no duplica una decision que ya estaba en el historial', async () => {
      await iniciar([{ id: 5, controlId: 14, value: 127, action: null, createdIn: '2026-10-21T10:00:00' }]);

      await emitir('decision', {
        id: 5, controlId: 14, value: 127, status: 'success',
        action: 'Corte de EQ en deck 14', createdIn: '2026-10-21T10:00:00',
      });

      expect(el().querySelectorAll('li.historial').length).toBe(1);
      expect(bodyText()).toContain('Corte de EQ en deck 14');
    });

    it('mantiene el historial en 50 eventos como maximo', async () => {
      const previos = Array.from({ length: 50 }, (_, i) => ({
        id: i + 1, controlId: 1, value: i, action: null, createdIn: '2026-10-21T09:00:00',
      }));
      await iniciar(previos);

      await emitir('decision', {
        id: 99, controlId: 2, value: 9, status: 'success', action: 'nuevo', createdIn: '2026-10-21T10:00:00',
      });

      expect(fixture.componentInstance.logs().length).toBe(50);
      expect(fixture.componentInstance.logs()[0].id).toBe(99);
    });

    it('el feed conserva solo los 20 eventos mas recientes', async () => {
      await iniciar();

      for (let i = 0; i < 25; i++) {
        await emitir('midi', { controlId: 1, value: i });
      }

      expect(el().querySelectorAll('[aria-live="polite"] li').length).toBe(20);
    });

    it('con la conexion en vivo abierta no vuelve a pedir el historial tras disparar un evento', async () => {
      await iniciar();
      FakeEventSource.last.open();
      fixture.detectChanges();

      fixture.componentInstance.simulateAutoMix();
      http.expectOne(`${BASE_URL}/ai/predict`).flush({ status: 'success', action: 'x' });
      await fixture.whenStable();

      http.expectNone(`${BASE_URL}/logs`);
    });

    it('al reconectar recarga el historial para recuperar lo perdido durante el corte', async () => {
      await iniciar();
      FakeEventSource.last.open();
      fixture.detectChanges();
      http.expectNone(`${BASE_URL}/logs`);

      FakeEventSource.last.fail();
      fixture.detectChanges();
      FakeEventSource.last.open();
      fixture.detectChanges();

      http.expectOne(`${BASE_URL}/logs`).flush([]);
    });
  });
});
