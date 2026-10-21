import { Injectable, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Deck, DeckId } from '../audio/deck';
import { httpErrorMessage } from '../http-error-message';
import { TransitionPlan, WeightsInfo } from '../models/autodj';
import { Track } from '../models/track';
import { AutoDjApiService } from './autodj-api';
import { MixerService } from './mixer';
import { SessionsApiService } from './sessions-api';
import { TrackApiService } from './tracks';
import { TransitionRunnerService } from './transition-runner';

/** Cada cuanto el Auto-DJ revisa en que punto va la pista que suena (ms). */
export const AUTODJ_TICK_MS = 500;
/** Espera antes de reintentar tras un error o cuando no hay pistas para continuar (ms). */
export const AUTODJ_RETRY_MS = 10_000;
/** Cuantas recomendaciones se piden a la IA para poder descartar las repetidas o sin audio. */
const SUGGESTION_LIMIT = 10;

export type AutoDjStatus = 'off' | 'esperando' | 'preparando' | 'mezclando' | 'error';

/** La siguiente pista ya elegida, con su audio cargado en el deck libre y su plan de transicion. */
export interface PreparedNext {
  track: Track;
  plan: TransitionPlan;
  deck: DeckId;
}

/**
 * Auto-DJ: mientras suena una pista prepara la siguiente en el otro deck (de la cola de la sesion y, si no
 * hay, de las recomendaciones de la IA) y, al llegar al punto de salida del plan, hace la transicion.
 */
@Injectable({ providedIn: 'root' })
export class AutoDjService {
  private readonly mixer = inject(MixerService);
  private readonly autodj = inject(AutoDjApiService);
  private readonly sessions = inject(SessionsApiService);
  private readonly tracks = inject(TrackApiService);
  private readonly runner = inject(TransitionRunnerService);

  readonly enabled = signal(false);
  readonly status = signal<AutoDjStatus>('off');
  readonly next = signal<PreparedNext | null>(null);
  /** Aviso o error para mostrar al usuario. */
  readonly message = signal<string | null>(null);
  readonly sessionId = signal<number | null>(null);

  /** La ultima transicion completada, para que el DJ pueda valorarla. */
  readonly lastTransition = signal<{ from: Track; to: Track } | null>(null);
  /** Valoracion dada a `lastTransition`; null si aun no se valoro. */
  readonly rating = signal<'liked' | 'disliked' | null>(null);
  readonly feedbackError = signal<string | null>(null);
  /** Pesos de la puntuacion que usa el motor (aprendidos de las valoraciones, o los de por defecto). */
  readonly weights = signal<WeightsInfo | null>(null);
  private sending = false;

  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private retryAt = 0;
  /** Pistas que ya sonaron en esta sesion de Auto-DJ, para no repetirlas. */
  private readonly played = new Set<number>();

  /** Activa el Auto-DJ. Necesita una pista sonando; abre una sesion si no hay ninguna. */
  async start(): Promise<void> {
    if (this.enabled()) {
      return;
    }
    if (!this.mixer.supported) {
      this.fail('Este navegador no soporta Web Audio.');
      return;
    }
    const current = this.playingDeck();
    if (!current) {
      this.fail('Pon a sonar una pista en un deck para activar el Auto-DJ.');
      return;
    }

    try {
      const active = await firstValueFrom(this.sessions.active());
      const session = active ?? (await firstValueFrom(this.sessions.start('Auto-DJ')));
      this.sessionId.set(session.id);
    } catch (error) {
      this.fail(httpErrorMessage(error, 'No se pudo abrir la sesion del Auto-DJ.'));
      return;
    }

    const track = current.track();
    if (track) {
      this.played.add(track.id);
    }
    this.enabled.set(true);
    this.status.set('esperando');
    this.message.set(null);
    this.timer = setInterval(() => void this.tick(), AUTODJ_TICK_MS);
  }

  /** Desactiva el Auto-DJ y cancela una transicion en curso. */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.runner.cancel();
    this.enabled.set(false);
    this.status.set('off');
    this.next.set(null);
    this.message.set(null);
    this.played.clear();
    this.retryAt = 0;
  }

  /** El DJ valora la ultima transicion; el motor reajusta sus pesos y devuelve los vigentes. */
  async rate(liked: boolean): Promise<void> {
    const transition = this.lastTransition();
    if (!transition || this.rating() !== null || this.sending) {
      return;
    }
    this.sending = true;
    this.feedbackError.set(null);
    try {
      const info = await firstValueFrom(this.autodj.sendFeedback(transition.from.id, transition.to.id, liked));
      this.weights.set(info);
      this.rating.set(liked ? 'liked' : 'disliked');
    } catch (error) {
      this.feedbackError.set(httpErrorMessage(error, 'No se pudo enviar la valoracion.'));
    } finally {
      this.sending = false;
    }
  }

  /** Consulta los pesos vigentes del motor. Si falla no se avisa: es informacion complementaria. */
  async loadWeights(): Promise<void> {
    try {
      this.weights.set(await firstValueFrom(this.autodj.weights()));
    } catch {
      // Sin los pesos el panel simplemente no muestra lo aprendido.
    }
  }

  /** Un paso del Auto-DJ: prepara la siguiente pista o dispara la transicion. Publico para poder probarlo. */
  async tick(): Promise<void> {
    if (!this.enabled() || this.busy) {
      return;
    }
    const current = this.playingDeck();
    if (!current) {
      return; // nada suena (pausa del DJ o fin de pista): se espera sin hacer nada
    }

    const prepared = this.next();
    if (!prepared) {
      if (Date.now() >= this.retryAt) {
        await this.prepareNext(current);
      }
      return;
    }
    if (current.position() >= prepared.plan.mixOutAt) {
      await this.transition(current, prepared);
    }
  }

  private async prepareNext(current: Deck): Promise<void> {
    const currentTrack = current.track();
    if (!currentTrack) {
      this.message.set('La pista que suena no esta analizada; el Auto-DJ necesita su BPM y tonalidad.');
      this.retryAt = Date.now() + AUTODJ_RETRY_MS;
      return;
    }

    this.busy = true;
    this.status.set('preparando');
    try {
      const track = await this.chooseNextTrack(currentTrack);
      if (!track) {
        this.message.set('No hay mas pistas para continuar. Agrega alguna a la cola o sube mas a la biblioteca.');
        this.status.set('esperando');
        this.retryAt = Date.now() + AUTODJ_RETRY_MS;
        return;
      }
      const plan = await firstValueFrom(this.autodj.transition(currentTrack.id, track.id));
      const deck = this.otherId(current);
      await this.mixer.loadTrack(deck, track);
      this.next.set({ track, plan, deck });
      this.message.set(null);
      this.status.set('esperando');
    } catch (error) {
      this.message.set(httpErrorMessage(error, 'El Auto-DJ no pudo preparar la siguiente pista.'));
      this.status.set('error');
      this.retryAt = Date.now() + AUTODJ_RETRY_MS;
    } finally {
      this.busy = false;
    }
  }

  /** Primero lo que el DJ puso en la cola; si esta vacia, la mejor recomendacion de la IA que tenga audio. */
  private async chooseNextTrack(current: Track): Promise<Track | null> {
    const sessionId = this.sessionId();
    if (sessionId !== null) {
      try {
        const item = await firstValueFrom(this.sessions.pollNext(sessionId));
        return await firstValueFrom(this.tracks.get(item.trackId));
      } catch (error) {
        // Una cola vacia responde 404: no es un fallo, se sigue con las recomendaciones.
        if (!(error instanceof HttpErrorResponse && error.status === 404)) {
          throw error;
        }
      }
    }

    const suggestions = await firstValueFrom(this.autodj.nextTracks(current.id, SUGGESTION_LIMIT));
    for (const candidate of suggestions.candidates) {
      if (this.played.has(candidate.track.id)) {
        continue;
      }
      const track = await firstValueFrom(this.tracks.get(candidate.track.id));
      if (track.hasAudio) {
        return track;
      }
    }
    return null;
  }

  private async transition(current: Deck, prepared: PreparedNext): Promise<void> {
    this.busy = true;
    this.status.set('mezclando');
    try {
      const outgoing = current.track();
      const result = await this.runner.run(prepared.plan, this.deckId(current), prepared.deck);
      if (result === 'completed') {
        this.played.add(prepared.track.id);
        if (outgoing) {
          this.lastTransition.set({ from: outgoing, to: prepared.track });
          this.rating.set(null);
          this.feedbackError.set(null);
        }
        this.next.set(null);
        this.status.set(this.enabled() ? 'esperando' : 'off');
      }
    } catch (error) {
      this.message.set(httpErrorMessage(error, 'La transicion fallo.'));
      this.status.set('error');
      this.next.set(null);
      this.retryAt = Date.now() + AUTODJ_RETRY_MS;
    } finally {
      this.busy = false;
    }
  }

  private fail(message: string): void {
    this.message.set(message);
    this.status.set('error');
  }

  /** El deck que esta sonando con una pista cargada (si suenan los dos, el que va mas avanzado). */
  private playingDeck(): Deck | null {
    const playing = (['A', 'B'] as DeckId[])
      .map((id) => this.mixer.deck(id))
      .filter((deck) => deck.playing() && deck.loaded);
    if (playing.length === 0) {
      return null;
    }
    return playing.reduce((a, b) => (b.position() > a.position() ? b : a));
  }

  private deckId(deck: Deck): DeckId {
    return deck.id;
  }

  private otherId(deck: Deck): DeckId {
    return deck.id === 'A' ? 'B' : 'A';
  }
}
