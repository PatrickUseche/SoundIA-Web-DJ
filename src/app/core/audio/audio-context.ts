import { InjectionToken } from '@angular/core';

/**
 * Crea el AudioContext. Devuelve null cuando no existe (renderizado en servidor o navegador sin Web Audio).
 * Se puede reemplazar en las pruebas por un contexto falso.
 */
export const AUDIO_CONTEXT_FACTORY = new InjectionToken<() => AudioContext | null>('AUDIO_CONTEXT_FACTORY', {
  providedIn: 'root',
  factory: () => () => (typeof AudioContext !== 'undefined' ? new AudioContext() : null),
});
