import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DashboardComponent } from './dashboard';
import { environment } from '../../../environments/environment';

const BASE_URL = environment.apiBaseUrl;

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
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

    fixture.componentInstance.simularMezclaAutomatica();
    const req = http.expectOne(`${BASE_URL}/ai/predict`);
    expect(req.request.body).toEqual({ controlId: 14, value: 127 });
    req.flush({ status: 'success', action: 'Corte de EQ en deck 14' });
    http.expectOne(`${BASE_URL}/logs`).flush([]);
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent;
    expect(texto).toContain('success');
    expect(texto).toContain('Corte de EQ en deck 14');
    expect(texto).not.toContain('[object Object]');
  });

  it('refresca el historial despues de disparar el evento', async () => {
    fixture.detectChanges();
    http.expectOne(`${BASE_URL}/logs`).flush([]);

    fixture.componentInstance.simularMezclaAutomatica();
    http.expectOne(`${BASE_URL}/ai/predict`).flush({ status: 'success', action: 'Corte de EQ' });
    http.expectOne(`${BASE_URL}/logs`).flush([
      { id: 7, controlId: 14, value: 127, createdIn: '2026-10-21T10:05:00' },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelectorAll('li').length).toBe(1);
  });

  describe('estados de carga y error', () => {
    const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => vi.restoreAllMocks());

    it('muestra un indicador mientras carga el historial', () => {
      fixture.detectChanges();

      expect(texto()).toContain('Cargando historial');
      http.expectOne(`${BASE_URL}/logs`).flush([]);
    });

    it('muestra un estado vacio cuando no hay eventos', async () => {
      fixture.detectChanges();
      http.expectOne(`${BASE_URL}/logs`).flush([]);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(texto()).not.toContain('Cargando historial');
      expect(texto()).toContain('Sin eventos registrados');
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
      expect(texto()).not.toContain('Sin eventos registrados');
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
});
