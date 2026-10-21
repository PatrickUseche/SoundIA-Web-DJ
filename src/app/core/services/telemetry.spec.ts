import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AiDecision, MidiEvent, TelemetryService } from './telemetry';

const BASE_URL = 'http://localhost:8080/api/v1/midi';

describe('TelemetryService', () => {
  let service: TelemetryService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TelemetryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getLogs hace GET al historial del API Gateway', () => {
    const logs = [{ id: 1, controlId: 14, value: 127 }];
    let recibido: unknown;

    service.getLogs().subscribe((respuesta) => (recibido = respuesta));

    const req = http.expectOne(`${BASE_URL}/logs`);
    expect(req.request.method).toBe('GET');
    req.flush(logs);
    expect(recibido).toEqual(logs);
  });

  it('predictMix hace POST del evento y devuelve la decision de la IA', () => {
    const evento: MidiEvent = { controlId: 14, value: 127 };
    const decision: AiDecision = { status: 'success', action: 'Corte de EQ' };
    let recibido: AiDecision | undefined;

    service.predictMix(evento).subscribe((respuesta) => (recibido = respuesta));

    const req = http.expectOne(`${BASE_URL}/ai/predict`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(evento);
    req.flush(decision);
    expect(recibido).toEqual(decision);
  });
});
