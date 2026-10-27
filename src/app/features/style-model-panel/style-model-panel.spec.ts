import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { StyleModelInfo } from '../../core/models/autodj';
import { StyleModelPanelComponent } from './style-model-panel';

const URL = `${environment.apiRootUrl}/autodj/style-model`;

const info = (cambios: Partial<StyleModelInfo> = {}): StyleModelInfo => ({
  goodRecordings: 8, required: 20, ready: false, enabled: false, ...cambios,
});

const listo = (cambios: Partial<StyleModelInfo> = {}): StyleModelInfo => info({
  goodRecordings: 25, ready: true,
  evaluation: {
    bars: { evaluated: 25, rulesError: 0.8, modelError: 0.3, wins: true },
    bassSwap: { evaluated: 20, rulesError: 0.1, modelError: 0.12, wins: false },
  },
  inUse: { bars: false, bassSwap: false },
  ...cambios,
});

describe('StyleModelPanelComponent', () => {
  let fixture: ComponentFixture<StyleModelPanelComponent>;
  let http: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;
  const texto = () => (el().textContent ?? '').replace(/\s+/g, ' ');
  const boton = () => el().querySelector('.interruptor-modelo button') as HTMLButtonElement;

  async function crear(respuesta: StyleModelInfo | null) {
    TestBed.configureTestingModule({ imports: [StyleModelPanelComponent], providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(StyleModelPanelComponent);
    fixture.detectChanges();
    if (respuesta) {
      http.expectOne(URL).flush(respuesta);
    } else {
      http.expectOne(URL).flush({ error: 'caido' }, { status: 502, statusText: 'Bad Gateway' });
    }
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => http?.verify());

  it('dice cuantas mezclas buenas lleva y cuantas faltan', async () => {
    await crear(info());

    expect(texto()).toContain('8 de 20 necesarias');
    expect(texto()).toContain('Faltan 12 mezclas buenas');
    const barra = el().querySelector('progress') as HTMLProgressElement;
    expect(barra.value).toBe(8);
    expect(barra.max).toBe(20);
  });

  it('con suficientes mezclas dice en que parametros gana a las reglas', async () => {
    await crear(listo());

    expect(texto()).toContain('Compases de solape: gana a las reglas (error 0,30 frente a 0,80 de las reglas)');
    expect(texto()).toContain('Punto del cambio de graves: todavía no gana a las reglas');
    expect(texto()).not.toContain('Faltan');
  });

  it('marca lo que se esta usando', async () => {
    await crear(listo({ enabled: true, inUse: { bars: true, bassSwap: false } }));

    expect(texto()).toContain('Compases de solape: gana');
    expect(texto()).toContain('· en uso');
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
