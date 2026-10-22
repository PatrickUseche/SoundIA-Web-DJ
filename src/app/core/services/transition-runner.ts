import { Injectable, inject, signal } from '@angular/core';
import { automationToKnob, interpolateAutomation } from '../audio/automation';
import { Deck, DeckId } from '../audio/deck';
import { EQ_BANDS, EqBand } from '../audio/eq';
import { TransitionPlan } from '../models/autodj';
import { MixerService } from './mixer';

/** Cada cuanto se aplica la automatizacion (ms). Una transicion dura decenas de segundos: es mas que suficiente. */
export const TRANSITION_TICK_MS = 100;

export type TransitionResult = 'completed' | 'cancelled';

/**
 * Ejecuta un plan de transicion entre dos decks: arranca la pista entrante a su ritmo y en su punto de
 * entrada, y durante el tiempo del plan mueve el crossfader y los ecualizadores segun sus curvas.
 * Al terminar detiene la pista saliente y deja los EQ planos.
 */
@Injectable({ providedIn: 'root' })
export class TransitionRunnerService {
  private readonly mixer = inject(MixerService);

  private timer: ReturnType<typeof setInterval> | null = null;
  private finish: ((result: TransitionResult) => void) | null = null;

  readonly running = signal(false);
  /** Avance de la transicion en curso, de 0 a 1. */
  readonly progress = signal(0);

  /**
   * Hace la transicion de `from` a `to`. Se resuelve con 'completed' al terminar o con 'cancelled' si se
   * cancela antes. Falla si alguno de los dos decks no tiene pista. Si ya habia una en curso, la cancela.
   */
  async run(plan: TransitionPlan, from: DeckId, to: DeckId): Promise<TransitionResult> {
    this.cancel();
    const outgoing = this.mixer.deck(from);
    const incoming = this.mixer.deck(to);
    if (!outgoing.loaded || !incoming.loaded) {
      throw new Error('Los dos decks necesitan una pista cargada para hacer la transicion.');
    }

    // La pista entrante entra en su punto de entrada, con las curvas ya en la posicion inicial. Solo se iguala
    // su tempo si cabe en el pitch fader: si no, suena a su ritmo natural en vez de quedar a medio ajustar.
    incoming.setPitch(plan.tempoMatch.feasible ? plan.tempoMatch.ratio : 1);
    incoming.seek(plan.mixInAt);
    incoming.setVolume(1);
    this.apply(plan, from, outgoing, incoming, 0);
    await this.mixer.resume();
    incoming.play();

    this.running.set(true);
    this.progress.set(0);

    // Un corte (sin duracion ni automatizacion) cambia de deck al instante.
    if (plan.style === 'cut' || plan.seconds <= 0 || plan.automation.length === 0) {
      return this.complete(plan, from, outgoing, incoming);
    }

    return new Promise<TransitionResult>((resolve) => {
      const startedAt = Date.now();
      this.finish = resolve;
      this.timer = setInterval(() => {
        const progress = Math.min(1, (Date.now() - startedAt) / (plan.seconds * 1000));
        this.progress.set(progress);
        this.apply(plan, from, outgoing, incoming, progress);
        if (progress >= 1) {
          resolve(this.complete(plan, from, outgoing, incoming));
        }
      }, TRANSITION_TICK_MS);
    });
  }

  /** Detiene la transicion en curso dejando el mezclador como esta en ese momento. */
  cancel(): void {
    if (this.timer === null && this.finish === null) {
      return;
    }
    this.stopTimer();
    const resolve = this.finish;
    this.finish = null;
    this.running.set(false);
    resolve?.('cancelled');
  }

  private apply(plan: TransitionPlan, from: DeckId, outgoing: Deck, incoming: Deck, progress: number): void {
    // El crossfader va de la pista saliente a la entrante: de izquierda a derecha si sale el deck A.
    this.mixer.setCrossfader(from === 'A' ? progress : 1 - progress);

    const point = interpolateAutomation(plan.automation, progress);
    if (!point) {
      return;
    }
    outgoing.setEq('low', automationToKnob(point.lowA));
    outgoing.setEq('mid', automationToKnob(point.midA));
    outgoing.setEq('high', automationToKnob(point.highA));
    incoming.setEq('low', automationToKnob(point.lowB));
    incoming.setEq('mid', automationToKnob(point.midB));
    incoming.setEq('high', automationToKnob(point.highB));
  }

  private complete(plan: TransitionPlan, from: DeckId, outgoing: Deck, incoming: Deck): TransitionResult {
    this.stopTimer();
    this.finish = null;
    // Solo suena la pista entrante: crossfader de su lado, EQ planos y la saliente detenida.
    this.mixer.setCrossfader(from === 'A' ? 1 : 0);
    outgoing.pause();
    for (const banda of EQ_BANDS as readonly EqBand[]) {
      outgoing.setEq(banda, 0.5);
      incoming.setEq(banda, 0.5);
    }
    this.progress.set(1);
    this.running.set(false);
    return 'completed';
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
