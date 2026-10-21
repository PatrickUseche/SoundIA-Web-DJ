import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TrackApiService } from './tracks';
import { Track } from '../models/track';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiRootUrl}/tracks`;

const pista = (cambios: Partial<Track> = {}): Track => ({
  id: 1, title: 'tema.wav', duration: 215.3, bpm: 127.98, key: 'A minor', camelot: '8A',
  energy: 0.62, cuePoints: [0.4, 30.4], hasAudio: true, createdAt: '2026-10-21T18:30:00+00:00',
  ...cambios,
});

describe('TrackApiService', () => {
  let service: TrackApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(TrackApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('list devuelve solo el arreglo de pistas', () => {
    let recibidas: Track[] | undefined;

    service.list().subscribe((tracks) => (recibidas = tracks));

    const req = http.expectOne(BASE);
    expect(req.request.method).toBe('GET');
    req.flush({ tracks: [pista({ id: 1 }), pista({ id: 2 })] });
    expect(recibidas?.map((t) => t.id)).toEqual([1, 2]);
  });

  it('get pide una pista por id', () => {
    let recibida: Track | undefined;

    service.get(7).subscribe((t) => (recibida = t));

    http.expectOne(`${BASE}/7`).flush(pista({ id: 7 }));
    expect(recibida?.id).toBe(7);
  });

  it('analyze sube el archivo como multipart con su nombre y el titulo', () => {
    const archivo = new File(['RIFFdatos'], 'tema.wav', { type: 'audio/wav' });
    let recibida: Track | undefined;

    service.analyze(archivo, '  Mi tema  ').subscribe((t) => (recibida = t));

    const req = http.expectOne(`${BASE}/analyze`);
    expect(req.request.method).toBe('POST');
    const body = req.request.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect((body.get('file') as File).name).toBe('tema.wav');
    expect(body.get('title')).toBe('Mi tema');
    req.flush(pista());
    expect(recibida?.camelot).toBe('8A');
  });

  it('analyze no envia el titulo si esta vacio o en blanco', () => {
    const archivo = new File(['x'], 'tema.wav');

    service.analyze(archivo).subscribe();
    expect((http.expectOne(`${BASE}/analyze`).request.body as FormData).has('title')).toBe(false);

    service.analyze(archivo, '   ').subscribe();
    expect((http.expectOne(`${BASE}/analyze`).request.body as FormData).has('title')).toBe(false);
  });

  it('getAudio descarga el audio como ArrayBuffer', () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    let recibido: ArrayBuffer | undefined;

    service.getAudio(4).subscribe((audio) => (recibido = audio));

    const req = http.expectOne(`${BASE}/4/audio`);
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('arraybuffer');
    req.flush(bytes);
    expect(recibido?.byteLength).toBe(3);
  });

  it('propaga el error del servidor para que la interfaz lo muestre', () => {
    let error: unknown;

    service.getAudio(9).subscribe({ error: (e) => (error = e) });

    http.expectOne(`${BASE}/9/audio`).error(new ProgressEvent('error'), { status: 404, statusText: 'Not Found' });
    expect((error as { status: number }).status).toBe(404);
  });
});
