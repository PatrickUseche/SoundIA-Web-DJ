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

  it('list pide las grabaciones sin filtro', () => {
    let lista: unknown;

    service.list().subscribe((l) => (lista = l));

    const req = http.expectOne(`${environment.apiRootUrl}/recordings`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toEqual([]);
    req.flush({ recordings: [], counts: { unreviewed: 0, good: 0, discard: 0, total: 0 } });
    expect(lista).toEqual({ recordings: [], counts: { unreviewed: 0, good: 0, discard: 0, total: 0 } });
  });

  it('list con una calidad la envia como parametro quality', () => {
    service.list('good').subscribe();

    const req = http.expectOne((r) => r.url === `${environment.apiRootUrl}/recordings`);
    expect(req.request.params.get('quality')).toBe('good');
    req.flush({ recordings: [], counts: { unreviewed: 0, good: 0, discard: 0, total: 0 } });
  });

  it('review hace PUT de los cambios a la grabacion', () => {
    service.review(4, { quality: 'discard', notes: 'desfasada' }).subscribe();

    const req = http.expectOne(`${environment.apiRootUrl}/recordings/4`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ quality: 'discard', notes: 'desfasada' });
    req.flush({ id: 4 });
  });

  it('remove hace DELETE de la grabacion', () => {
    service.remove(4).subscribe();

    const req = http.expectOne(`${environment.apiRootUrl}/recordings/4`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('exportAll pide la copia como un archivo', () => {
    let archivo: Blob | undefined;

    service.exportAll().subscribe((b) => (archivo = b));

    const req = http.expectOne(`${environment.apiRootUrl}/recordings/export`);
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['{}'], { type: 'application/json' }));
    expect(archivo?.size).toBe(2);
  });

  it('importAll envia la copia con un POST y devuelve cuantas se restauraron', () => {
    let resultado: unknown;
    const copia = { format: 'soundia-recordings', version: 1, recordings: [] };

    service.importAll(copia).subscribe((r) => (resultado = r));

    const req = http.expectOne(`${environment.apiRootUrl}/recordings/import`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(copia);
    req.flush({ created: 2, skipped: 1 });
    expect(resultado).toEqual({ created: 2, skipped: 1 });
  });
});
