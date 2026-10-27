import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { Track } from '../models/track';
import { AutoDjApiService } from './autodj-api';
import { ChoiceRecorderService } from './choice-recorder';

const pista = (id: number): Track => ({
  id, title: `Pista ${id}`, duration: 200, bpm: 120, key: 'C major', camelot: '8B', energy: 0.5, cuePoints: [],
  hasAudio: true, createdAt: '2026-10-20T10:00:00Z',
});

const sugerencias = (...ids: number[]) => ({
  current: {},
  candidates: ids.map((id) => ({ track: { id }, compatibility: {} })),
});

describe('ChoiceRecorderService', () => {
  let api: { nextTracks: ReturnType<typeof vi.fn>; submitChoice: ReturnType<typeof vi.fn> };
  let servicio: ChoiceRecorderService;

  beforeEach(() => {
    api = {
      nextTracks: vi.fn(() => of(sugerencias(5, 6, 7))),
      submitChoice: vi.fn(() => of({})),
    };
    TestBed.configureTestingModule({ providers: [{ provide: AutoDjApiService, useValue: api }] });
    servicio = TestBed.inject(ChoiceRecorderService);
  });

  it('si el DJ puso la pista en la cola, cuenta cual habria propuesto la IA', async () => {
    await servicio.record(pista(1), pista(9), 'queue');

    expect(api.nextTracks).toHaveBeenCalledWith(1, 10);
    expect(api.submitChoice).toHaveBeenCalledWith(1, 9, 5);
  });

  it('la propuesta de la IA no repite pistas que ya sonaron', async () => {
    await servicio.record(pista(1), pista(9), 'queue', new Set([5]));

    expect(api.submitChoice).toHaveBeenCalledWith(1, 9, 6);
  });

  it('si no queda propuesta, cuenta la eleccion sin ella', async () => {
    api.nextTracks.mockReturnValue(of(sugerencias()));

    await servicio.record(pista(1), pista(9), 'queue');

    expect(api.submitChoice).toHaveBeenCalledWith(1, 9, null);
  });

  it('si el Auto-DJ tomo la recomendacion de la IA, el DJ la acepto y no se pregunta nada', async () => {
    await servicio.record(pista(1), pista(5), 'ai');

    expect(api.nextTracks).not.toHaveBeenCalled();
    expect(api.submitChoice).toHaveBeenCalledWith(1, 5, 5);
  });

  it('si algo falla no lanza: es informacion complementaria', async () => {
    api.submitChoice.mockReturnValue(throwError(() => new Error('sin red')));

    await expect(servicio.record(pista(1), pista(9), 'queue')).resolves.toBeUndefined();
  });
});
