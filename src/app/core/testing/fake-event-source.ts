import { EVENT_SOURCE_FACTORY } from '../services/telemetry-stream';

/** EventSource de mentira: permite emitir eventos y simular cortes de conexion en las pruebas. */
export class FakeEventSource {
  static instances: FakeEventSource[] = [];

  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 0;
  closed = false;
  private listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  /** Ultima conexion creada. */
  static get last(): FakeEventSource {
    return FakeEventSource.instances[FakeEventSource.instances.length - 1];
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close(): void {
    this.closed = true;
    this.readyState = 2;
  }

  /** Simula un evento SSE enviado por el servidor. */
  emit(type: string, data: string): void {
    this.listeners.get(type)?.forEach((l) => l({ data } as MessageEvent<string>));
  }

  /** Simula que el navegador abrio la conexion. */
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  /** Simula un corte; con closedForever=false el navegador sigue reintentando. */
  fail(closedForever = false): void {
    this.readyState = closedForever ? 2 : 0;
    this.onerror?.();
  }
}

/** Provider para TestBed que reemplaza el EventSource real por el falso. */
export function provideFakeEventSource() {
  FakeEventSource.instances = [];
  return {
    provide: EVENT_SOURCE_FACTORY,
    useValue: (url: string) => new FakeEventSource(url) as unknown as EventSource,
  };
}
