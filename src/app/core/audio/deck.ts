import { signal } from '@angular/core';
import { Track } from '../models/track';
import { clampPitch } from './beatmatch';
import { EqBand, eqValueToDb } from './eq';
import { computePeaks, normalizePeaks } from './waveform';

// Frecuencias de corte de cada banda (Hz), las habituales de un mixer de DJ.
const EQ_FREQUENCY: Record<EqBand, number> = { low: 320, mid: 1000, high: 3200 };
const EQ_FILTER_TYPE: Record<EqBand, BiquadFilterType> = {
  low: 'lowshelf',
  mid: 'peaking',
  high: 'highshelf',
};

export type DeckId = 'A' | 'B';

/** Cuantos picos se calculan de la forma de onda de la pista cargada. */
export const WAVEFORM_PEAKS = 800;

/**
 * Un deck: carga una pista y la reproduce a traves de un EQ de tres bandas, un fader de volumen y un
 * nodo de crossfader que controla el mixer.
 *
 *   fuente -> EQ grave -> EQ medio -> EQ agudo -> volumen -> crossfader -> destino
 *
 * Una fuente de Web Audio (AudioBufferSourceNode) solo se puede iniciar una vez, asi que se crea una
 * nueva en cada reproduccion o salto. La posicion se calcula a partir del reloj del contexto.
 */
export class Deck {
  readonly track = signal<Track | null>(null);
  readonly playing = signal(false);
  readonly pitch = signal(1);
  readonly volume = signal(1);
  readonly eq = signal<Record<EqBand, number>>({ low: 0.5, mid: 0.5, high: 0.5 });
  readonly cuePoint = signal(0);
  /** Picos normalizados (0-1) de la pista cargada, para dibujar su forma de onda; null si no hay pista. */
  readonly peaks = signal<Float32Array | null>(null);

  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  /** Posicion (s) en la que estaba la pista cuando se inicio/pauso por ultima vez. */
  private offset = 0;
  /** Hora del contexto en la que empezo el tramo de reproduccion actual. */
  private startedAt = 0;

  private readonly filters: Record<EqBand, BiquadFilterNode>;
  private readonly volumeNode: GainNode;
  private readonly crossfaderNode: GainNode;

  constructor(
    readonly id: DeckId,
    private readonly ctx: AudioContext,
    destination: AudioNode,
  ) {
    this.filters = { low: this.createFilter('low'), mid: this.createFilter('mid'), high: this.createFilter('high') };
    this.volumeNode = ctx.createGain();
    this.crossfaderNode = ctx.createGain();

    this.filters.low.connect(this.filters.mid);
    this.filters.mid.connect(this.filters.high);
    this.filters.high.connect(this.volumeNode);
    this.volumeNode.connect(this.crossfaderNode);
    this.crossfaderNode.connect(destination);
  }

  get loaded(): boolean {
    return this.buffer !== null;
  }

  /** Duracion de la pista cargada en segundos (0 si no hay ninguna). */
  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  /** BPM real al que suena la pista ahora mismo (el de la pista por el factor de pitch). */
  get effectiveBpm(): number | null {
    const track = this.track();
    return track ? track.bpm * this.pitch() : null;
  }

  /** Carga una pista y deja el deck detenido al principio. Sustituye a la que hubiera. */
  load(buffer: AudioBuffer, track: Track | null = null): void {
    this.stopSource();
    this.buffer = buffer;
    this.offset = 0;
    this.playing.set(false);
    this.track.set(track);
    this.cuePoint.set(track?.cuePoints[0] ?? 0);
    this.peaks.set(normalizePeaks(computePeaks(buffer.getChannelData(0), WAVEFORM_PEAKS)));
  }

  /** Vacia el deck. */
  eject(): void {
    this.stopSource();
    this.buffer = null;
    this.offset = 0;
    this.playing.set(false);
    this.track.set(null);
    this.cuePoint.set(0);
    this.peaks.set(null);
  }

  /** Posicion actual de reproduccion en segundos. */
  position(): number {
    if (!this.buffer) {
      return 0;
    }
    if (!this.playing()) {
      return this.offset;
    }
    const elapsed = (this.ctx.currentTime - this.startedAt) * this.pitch();
    return Math.min(this.duration, this.offset + elapsed);
  }

  play(): void {
    if (!this.buffer || this.playing()) {
      return;
    }
    // Los navegadores arrancan el contexto suspendido hasta que hay un gesto del usuario.
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    // Si la pista estaba al final, vuelve a empezar.
    if (this.offset >= this.duration) {
      this.offset = 0;
    }
    this.startSource(this.offset);
    this.playing.set(true);
  }

  pause(): void {
    if (!this.playing()) {
      return;
    }
    this.offset = this.position();
    this.stopSource();
    this.playing.set(false);
  }

  /** Salta a un instante (se limita a la duracion). Si estaba sonando, sigue sonando desde alli. */
  seek(seconds: number): void {
    if (!this.buffer) {
      return;
    }
    const target = Math.min(this.duration, Math.max(0, seconds));
    if (this.playing()) {
      this.stopSource();
      this.startSource(target);
    } else {
      this.offset = target;
    }
  }

  /** Guarda la posicion actual como punto cue. */
  setCue(): void {
    this.cuePoint.set(this.position());
  }

  /** Vuelve al punto cue (sin cambiar si estaba sonando o no). */
  goToCue(): void {
    this.seek(this.cuePoint());
  }

  /** Cambia la velocidad (factor sobre la original, limitado al rango del pitch fader de +-8 %). */
  setPitch(ratio: number): void {
    const next = clampPitch(ratio);
    if (this.playing()) {
      // Se fija la posicion con el pitch anterior para que no haya un salto al cambiar la velocidad.
      this.offset = this.position();
      this.startedAt = this.ctx.currentTime;
      if (this.source) {
        this.source.playbackRate.value = next;
      }
    }
    this.pitch.set(next);
  }

  /** Volumen del deck, de 0 a 1. */
  setVolume(value: number): void {
    const v = Math.min(1, Math.max(0, value));
    this.volumeNode.gain.value = v;
    this.volume.set(v);
  }

  /** Posicion de la perilla de una banda del EQ, de 0 (cortada) a 1 (realzada); 0.5 es plano. */
  setEq(band: EqBand, value: number): void {
    const v = Math.min(1, Math.max(0, value));
    this.filters[band].gain.value = eqValueToDb(v);
    this.eq.update((actual) => ({ ...actual, [band]: v }));
  }

  /** Ganancia del crossfader de este deck (la fija el mixer). */
  setCrossfaderGain(gain: number): void {
    this.crossfaderNode.gain.value = Math.min(1, Math.max(0, gain));
  }

  private createFilter(band: EqBand): BiquadFilterNode {
    const filter = this.ctx.createBiquadFilter();
    filter.type = EQ_FILTER_TYPE[band];
    filter.frequency.value = EQ_FREQUENCY[band];
    if (band === 'mid') {
      filter.Q.value = 0.5;
    }
    filter.gain.value = 0;
    return filter;
  }

  private startSource(from: number): void {
    const source = this.ctx.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = this.pitch();
    source.connect(this.filters.low);
    source.onended = () => this.onSourceEnded(source);
    source.start(0, from);
    this.source = source;
    this.offset = from;
    this.startedAt = this.ctx.currentTime;
  }

  /** Detiene la fuente actual sin que su evento "ended" se interprete como el fin de la pista. */
  private stopSource(): void {
    const source = this.source;
    this.source = null;
    if (source) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // Ya estaba detenida.
      }
      source.disconnect();
    }
  }

  private onSourceEnded(source: AudioBufferSourceNode): void {
    // Solo cuenta si es la fuente vigente: las que se reemplazaron al saltar ya no importan.
    if (this.source !== source) {
      return;
    }
    this.source = null;
    this.offset = this.duration;
    this.playing.set(false);
  }
}
