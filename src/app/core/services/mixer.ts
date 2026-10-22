import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AUDIO_CONTEXT_FACTORY } from '../audio/audio-context';
import { MIN_PHASE_SHIFT_SECONDS, phaseShift } from '../audio/beatgrid';
import { TempoMatch, matchTempo } from '../audio/beatmatch';
import { crossfaderGains } from '../audio/crossfader';
import { Deck, DeckId } from '../audio/deck';
import { AudioDecodeError, AudioUnsupportedError, TrackWithoutAudioError } from '../audio/errors';
import { Track } from '../models/track';
import { TrackApiService } from './tracks';

/**
 * La mesa de mezclas: dos decks, un crossfader de potencia constante y un volumen maestro.
 *
 *   deck A --\
 *             +--> maestro --> altavoces
 *   deck B --/
 */
@Injectable({ providedIn: 'root' })
export class MixerService {
  private readonly tracks = inject(TrackApiService);
  private readonly ctx = inject(AUDIO_CONTEXT_FACTORY)();
  private readonly master: GainNode | null;
  private readonly decks: Record<DeckId, Deck> | null;

  /** Posicion del crossfader: 0 = solo deck A, 0.5 = centro, 1 = solo deck B. */
  readonly crossfader = signal(0.5);
  readonly masterVolume = signal(1);

  constructor() {
    if (this.ctx) {
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.decks = { A: new Deck('A', this.ctx, this.master), B: new Deck('B', this.ctx, this.master) };
      this.applyCrossfader();
    } else {
      this.master = null;
      this.decks = null;
    }
  }

  /** El navegador tiene Web Audio y el mixer esta listo para usarse. */
  get supported(): boolean {
    return this.decks !== null;
  }

  deck(id: DeckId): Deck {
    if (!this.decks) {
      throw new AudioUnsupportedError();
    }
    return this.decks[id];
  }

  /** Deck opuesto al indicado. */
  otherDeck(id: DeckId): Deck {
    return this.deck(id === 'A' ? 'B' : 'A');
  }

  setCrossfader(position: number): void {
    this.crossfader.set(Math.min(1, Math.max(0, position)));
    this.applyCrossfader();
  }

  setMasterVolume(value: number): void {
    const v = Math.min(1, Math.max(0, value));
    this.masterVolume.set(v);
    if (this.master) {
      this.master.gain.value = v;
    }
  }

  /** Reanuda el contexto de audio; hay que llamarlo desde un gesto del usuario (un clic). */
  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  /** Carga un audio ya decodificado en un deck. */
  loadBuffer(id: DeckId, buffer: AudioBuffer, track: Track | null = null): void {
    this.deck(id).load(buffer, track);
  }

  /** Decodifica los bytes de un archivo de audio y los carga en un deck. */
  async loadArrayBuffer(id: DeckId, data: ArrayBuffer, track: Track | null = null): Promise<void> {
    const deck = this.deck(id);
    let buffer: AudioBuffer;
    try {
      buffer = await this.ctx!.decodeAudioData(data);
    } catch {
      throw new AudioDecodeError();
    }
    deck.load(buffer, track);
  }

  /** Descarga el audio de una pista de la biblioteca y lo carga en un deck. */
  async loadTrack(id: DeckId, track: Track): Promise<void> {
    if (!track.hasAudio) {
      throw new TrackWithoutAudioError(track.title);
    }
    const data = await firstValueFrom(this.tracks.getAudio(track.id));
    await this.loadArrayBuffer(id, data, track);
  }

  /** Carga un archivo del disco del usuario (sin analizarlo: no tiene BPM ni puntos de mezcla). */
  async loadFile(id: DeckId, file: File): Promise<void> {
    await this.loadArrayBuffer(id, await file.arrayBuffer(), null);
  }

  /**
   * Ajusta el pitch del deck para que su tempo coincida con el del otro deck. Devuelve el ajuste
   * calculado, o null si falta alguna pista con BPM conocido. Si el ajuste no cabe en el rango del
   * fader (+-8 %), el pitch queda al limite y `feasible` es false.
   *
   * Si los dos decks suenan y tienen rejilla de pulsos, ademas mueve la pista de este deck (como mucho medio
   * pulso) para que sus golpes caigan sobre los del otro: igualar el tempo solo no basta para que coincidan.
   * Eso no se hace si el ajuste no cabe en el fader ni si el motor lo igualaria a la mitad o al doble de tempo.
   */
  sync(id: DeckId): TempoMatch | null {
    const deck = this.deck(id);
    const other = this.otherDeck(id);
    const reference = other.effectiveBpm;
    const track = deck.track();
    if (reference === null || !track) {
      return null;
    }
    const match = matchTempo(reference, track.bpm);
    deck.setPitch(match.ratio);
    this.alignPhase(deck, other, match);
    return match;
  }

  private alignPhase(deck: Deck, other: Deck, match: TempoMatch): void {
    const follower = deck.track();
    const leader = other.track();
    if (!follower || !leader || !match.feasible || match.multiplier !== 1 || !deck.playing() || !other.playing()) {
      return;
    }
    const shift = phaseShift({
      leader,
      leaderPosition: other.position(),
      leaderRate: other.pitch(),
      follower,
      followerPosition: deck.position(),
      followerRate: deck.pitch(),
    });
    if (shift !== null && Math.abs(shift) >= MIN_PHASE_SHIFT_SECONDS) {
      deck.seek(Math.max(0, deck.position() + shift));
    }
  }

  private applyCrossfader(): void {
    if (!this.decks) {
      return;
    }
    const { a, b } = crossfaderGains(this.crossfader());
    this.decks.A.setCrossfaderGain(a);
    this.decks.B.setCrossfaderGain(b);
  }
}
