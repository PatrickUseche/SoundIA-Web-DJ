import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { StyleModelInfo } from '../../core/models/autodj';
import { StyleModelPanelComponent } from './style-model-panel';

const URL = `${environment.apiRootUrl}/autodj/style-model`;

const info = (changes: Partial<StyleModelInfo> = {}): StyleModelInfo => ({
  goodRecordings: 8, required: 20, ready: false, enabled: false, ...changes,
});

const listo = (changes: Partial<StyleModelInfo> = {}): StyleModelInfo => info({
  goodRecordings: 25, ready: true,
  evaluation: {
    bars: { evaluated: 25, rulesError: 0.8, modelError: 0.3, wins: true },
    bassSwap: { evaluated: 20, rulesError: 0.1, modelError: 0.12, wins: false },
  },
  inUse: { bars: false, bassSwap: false },
  ...changes,
});

describe('StyleModelPanelComponent', () => {
  let fixture: ComponentFixture<StyleModelPanelComponent>;
  let http: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;
  const bodyText = () => (el().textContent ?? '').replace(/\s+/g, ' ');
  const boton = () => el().querySelector('.interruptor-modelo button') as HTMLButtonElement;

  async function crear(reply: StyleModelInfo | null) {
    TestBed.configureTestingModule({ imports: [StyleModelPanelComponent], providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(StyleModelPanelComponent);
    fixture.detectChanges();
    if (reply) {
      http.expectOne(URL).flush(reply);
    } else {
      http.expectOne(URL).flush({ error: 'caido' }, { status: 502, statusText: 'Bad Gateway' });
    }
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => http?.verify());

  it('dice cuantas mezclas buenas lleva y cuantas faltan', async () => {
    await crear(info());

    expect(bodyText()).toContain('8 de 20 necesarias');
    expect(bodyText()).toContain('Faltan 12 mezclas buenas');
    const barra = el().querySelector('progress') as HTMLProgressElement;
    expect(barra.value).toBe(8);
    expect(barra.max).toBe(20);
  });

  it('con suficientes mezclas dice en que parametros gana a las reglas', async () => {
    await crear(listo());

    expect(bodyText()).toContain('Compases de solape: gana a las reglas (error 0,30 frente a 0,80 de las reglas)');
    expect(bodyText()).toContain('Punto del cambio de graves: todavía no gana a las reglas');
    expect(bodyText()).not.toContain('Faltan');
  });

  it('marca lo que se esta usando', async () => {
    await crear(listo({ enabled: true, inUse: { bars: true, bassSwap: false } }));

    expect(bodyText()).toContain('Compases de solape: gana');
    expect(bodyText()).toContain('· en uso');
  });

  it('dice cuantas correcciones lleva el modelo de que pista sigue', async () => {
    await crear(info({ nextTrack: { choices: 9, corrections: 6, required: 15, ready: false } }));

    expect(bodyText()).toContain('Correcciones: 6 de 15 necesarias');
    expect(bodyText()).toContain('Faltan 9.');
  });

  it('cuando el modelo de que pista sigue gana lo dice con su porcentaje', async () => {
    await crear(listo({
      enabled: true,
      nextTrack: {
        choices: 30, corrections: 20, required: 15, ready: true, inUse: true,
        evaluation: { evaluated: 20, accuracy: 0.8, rulesAccuracy: 0, wins: true },
      },
    }));

    expect(bodyText()).toContain('habría acertado 80 %: ya gana a las reglas · en uso');
  });

  it('el interruptor enciende el modelo y muestra el nuevo estado', async () => {
    await crear(listo());
    expect(boton().getAttribute('aria-pressed')).toBe('false');
    expect(boton().textContent?.trim()).toBe('Usar mi estilo: apagado');

    boton().click();
    const peticion = http.expectOne(URL);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ enabled: true });
    peticion.flush(listo({ enabled: true, inUse: { bars: true, bassSwap: false } }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(boton().getAttribute('aria-pressed')).toBe('true');
    expect(boton().textContent?.trim()).toBe('Usar mi estilo: activado');
  });

  it('apagarlo vuelve a las reglas', async () => {
    await crear(listo({ enabled: true }));

    boton().click();
    const peticion = http.expectOne(URL);
    expect(peticion.request.body).toEqual({ enabled: false });
    peticion.flush(listo({ enabled: false }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(boton().textContent?.trim()).toBe('Usar mi estilo: apagado');
  });

  it('si el API falla lo dice y no deja un estado inventado', async () => {
    await crear(null);

    expect(el().querySelector('[role="alert"]')?.textContent).toContain('caido');
    expect(el().querySelector('.interruptor-modelo')).toBeNull();
  });
});
