import { MidiEvent } from '../services/telemetry';

// Bytes de estado MIDI (los 4 bits altos del primer byte; los bajos son el canal).
const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const CONTROL_CHANGE = 0xb0;

/**
 * Las notas (botones, pads) comparten espacio de controlId con los controles continuos (faders,
 * perillas): una nota N se identifica como NOTE_ID_OFFSET + N, para no chocar con el CC del mismo numero.
 */
export const NOTE_ID_OFFSET = 128;

/**
 * Evento del aparato: lo que entiende el API (`controlId` y `value`) mas el canal MIDI (0-15) por el que llego.
 * El canal solo sirve para asignar controles en el navegador: no se envia al API.
 */
export interface ControllerEvent extends MidiEvent {
  channel: number;
}

/**
 * Convierte un mensaje MIDI crudo en un control (`controlId`), su valor (0-127) y el canal por el que llego.
 * Devuelve null para todo lo que no sea un movimiento de control o un boton pulsado (reloj, notas soltadas,
 * pitch bend, mensajes incompletos...).
 *
 * El `controlId` no incluye el canal, para que el API siga recibiendo el mismo identificador: dos decks que
 * usen el mismo CC en canales distintos se distinguen por `channel`.
 */
export function parseMidiMessage(data: ArrayLike<number> | null | undefined): ControllerEvent | null {
  if (!data || data.length < 3) {
    return null;
  }

  const status = data[0] & 0xf0;
  const channel = data[0] & 0x0f;
  const number = data[1];
  const value = data[2];
  if (number > 127 || value > 127) {
    return null;
  }

  switch (status) {
    case CONTROL_CHANGE:
      return { controlId: number, value, channel };
    case NOTE_ON:
      // Una nota con velocidad 0 es, por convencion, una nota soltada.
      return value === 0 ? null : { controlId: NOTE_ID_OFFSET + number, value, channel };
    case NOTE_OFF:
    default:
      return null;
  }
}
