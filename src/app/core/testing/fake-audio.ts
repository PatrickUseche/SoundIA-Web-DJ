/**
 * Web Audio de mentira para las pruebas: los nodos registran sus conexiones y los parametros guardan su
 * valor, y el reloj (`currentTime`) lo mueve la propia prueba. Implementa solo lo que usa la aplicacion.
 */

export class FakeAudioParam {
  value: number;
  /** Historial de cambios programados: [tipo, valor, tiempo]. */
  readonly calls: [string, number, number][] = [];

  constructor(value = 0) {
    this.value = value;
  }

  setValueAtTime(value: number, time: number): this {
    this.calls.push(['setValueAtTime', value, time]);
    this.value = value;
    return this;
  }

  linearRampToValueAtTime(value: number, time: number): this {
    this.calls.push(['linearRampToValueAtTime', value, time]);
    this.value = value;
    return this;
  }

  setTargetAtTime(value: number, time: number): this {
    this.calls.push(['setTargetAtTime', value, time]);
    this.value = value;
    return this;
  }

  cancelScheduledValues(): this {
    return this;
  }
}

export class FakeAudioNode {
  readonly connections: FakeAudioNode[] = [];
  disconnected = false;

  connect<T extends FakeAudioNode>(target: T): T {
    this.connections.push(target);
    return target;
  }

  disconnect(): void {
    this.disconnected = true;
    this.connections.length = 0;
  }
}

export class FakeGainNode extends FakeAudioNode {
  readonly gain = new FakeAudioParam(1);
}

export class FakeBiquadFilterNode extends FakeAudioNode {
  type = 'lowpass';
  readonly frequency = new FakeAudioParam(350);
  readonly Q = new FakeAudioParam(1);
  readonly gain = new FakeAudioParam(0);
}

export class FakeAudioBuffer {
  readonly numberOfChannels: number;
  readonly sampleRate: number;
  readonly length: number;
  private readonly channels: Float32Array[];

  constructor(seconds: number, sampleRate = 8000, channels = 1) {
    this.sampleRate = sampleRate;
    this.numberOfChannels = channels;
    this.length = Math.floor(seconds * sampleRate);
    this.channels = Array.from({ length: channels }, () => new Float32Array(this.length));
  }

  get duration(): number {
    return this.length / this.sampleRate;
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel];
  }
}

export class FakeBufferSourceNode extends FakeAudioNode {
  buffer: FakeAudioBuffer | null = null;
  readonly playbackRate = new FakeAudioParam(1);
  onended: (() => void) | null = null;
  /** [cuando, desde] con los que se llamo a start(). */
  startedWith: [number, number] | null = null;
  stopped = false;

  start(when = 0, offset = 0): void {
    this.startedWith = [when, offset];
  }

  stop(): void {
    this.stopped = true;
    // Un stop() real dispara "ended": el codigo que no quiera reaccionar debe quitar onended antes.
    this.onended?.();
  }

  /** La pista llego sola al final. */
  finish(): void {
    this.onended?.();
  }
}

export class FakeAudioContext {
  currentTime = 0;
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  readonly sampleRate = 8000;
  readonly destination = new FakeAudioNode();
  readonly gains: FakeGainNode[] = [];
  readonly filters: FakeBiquadFilterNode[] = [];
  readonly sources: FakeBufferSourceNode[] = [];
  resumeCalls = 0;
  /** Segundos de audio que "decodifica" decodeAudioData (la duracion no depende de los bytes). */
  decodedSeconds = 10;

  createGain(): FakeGainNode {
    const node = new FakeGainNode();
    this.gains.push(node);
    return node;
  }

  createBiquadFilter(): FakeBiquadFilterNode {
    const node = new FakeBiquadFilterNode();
    this.filters.push(node);
    return node;
  }

  createBufferSource(): FakeBufferSourceNode {
    const node = new FakeBufferSourceNode();
    this.sources.push(node);
    return node;
  }

  async resume(): Promise<void> {
    this.resumeCalls++;
    this.state = 'running';
  }

  async decodeAudioData(data: ArrayBuffer): Promise<FakeAudioBuffer> {
    if (data.byteLength === 0) {
      throw new DOMException('Unable to decode audio data', 'EncodingError');
    }
    return new FakeAudioBuffer(this.decodedSeconds);
  }

  /** Atajo para las pruebas: ultima fuente de audio creada. */
  get lastSource(): FakeBufferSourceNode {
    return this.sources[this.sources.length - 1];
  }
}
