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
});
