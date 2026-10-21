// Mensajes del flujo SSE de Spring Boot (GET /api/v1/midi/stream).

/** Evento "midi": acaba de llegar un movimiento del controlador. */
export interface MidiMessage {
  controlId: number;
  value: number;
}

/** Evento "decision": la IA respondio (o no estuvo disponible) y el evento quedo guardado. */
export interface DecisionMessage {
  id: number;
  controlId: number;
  value: number;
  // "success" cuando la IA responde; "unavailable" si no respondio tras los reintentos.
  status: string;
  action: string | null;
  createdIn: string;
}

export type StreamEvent =
  | { type: 'midi'; data: MidiMessage }
  | { type: 'decision'; data: DecisionMessage };

/** Estado de la conexion en vivo, pensado para mostrarse en la interfaz. */
export type ConnectionState = 'connecting' | 'open' | 'reconnecting' | 'closed';
