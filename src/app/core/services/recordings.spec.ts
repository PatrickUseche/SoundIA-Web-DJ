import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RecordingApiService } from './recordings';
import { RecordingRequest } from '../models/recording';
import { environment } from '../../../environments/environment';

const curvaVacia = { volume: [], low: [], mid: [], high: [] };

const grabacion: RecordingRequest = {
  fromTrackId: 1, toTrackId: 2, source: 'manual', dj: 'dj', mixOutAt: 120, mixInAt: 2,
  overlapSeconds: 16, pitchA: 1, pitchB: 1.01,
  curves: { crossfader: [[0, 0], [16, 1]], a: curvaVacia, b: curvaVacia },
};

describe('RecordingApiService', () => {
  let service: RecordingApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(RecordingApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('create hace POST de la grabacion a /recordings', () => {
    let guardada: unknown;

    service.create(grabacion).subscribe((r) => (guardada = r));

    const req = http.expectOne(`${environment.apiRootUrl}/recordings`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(grabacion);
    req.flush({ id: 5, quality: 'unreviewed', features: { overlapBars: 8 } }, { status: 201, statusText: 'Created' });
    expect(guardada).toEqual({ id: 5, quality: 'unreviewed', features: { overlapBars: 8 } });
  });
});
