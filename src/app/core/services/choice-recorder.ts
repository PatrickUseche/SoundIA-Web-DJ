import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Track } from '../models/track';
import { AutoDjApiService } from './autodj-api';

/** Cuantas recomendaciones se piden para saber cual habria propuesto la IA (igual que el Auto-DJ). */
const SUGGESTION_LIMIT = 10;

/**
 * Cuenta al motor lo que el DJ elige como siguiente pista, para que aprenda de las veces que se aparta de lo que la IA
 * proponia. Es informacion complementaria: si algo falla, el Auto-DJ sigue y el DJ no tiene que enterarse.
 */
@Injectable({ providedIn: 'root' })
export class ChoiceRecorderService {
  private readonly api = inject(AutoDjApiService);

  /**
   * `source`: 'queue' si el DJ puso la pista en la cola (entonces se pregunta a la IA cual habria elegido) o 'ai' si
   * el Auto-DJ tomo la recomendacion de la IA (el DJ la acepto: la propuesta es la misma pista).
   * `played`: pistas ya sonadas en la sesion, que la IA no vuelve a proponer.
   */
  async record(current: Track, chosen: Track, source: 'queue' | 'ai', played: ReadonlySet<number> = new Set()): Promise<void> {
    try {
      let recommended: number | null = chosen.id;
      if (source === 'queue') {
        const suggestions = await firstValueFrom(this.api.nextTracks(current.id, SUGGESTION_LIMIT));
        recommended = suggestions.candidates.find((c) => !played.has(c.track.id))?.track.id ?? null;
      }
      await firstValueFrom(this.api.submitChoice(current.id, chosen.id, recommended));
    } catch {
      // Complementario: la mezcla ya esta en marcha.
    }
  }
}
