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
 * Convierte un mensaje MIDI crudo en el evento que entiende el API: un control (`controlId`) y su
 * valor (0-127). Devuelve null para todo lo que no sea un movimiento de control o un boton pulsado
 * (reloj, notas soltadas, pitch bend, mensajes incompletos...).
 *
 * Limitacion conocida: el canal se ignora, asi que dos decks que usen el mismo numero de CC en canales
 * distintos llegan como el mismo controlId.
 */
export function parseMidiMessage(data: ArrayLike<number> | null | undefined): MidiEvent | null {
  if (!data || data.length < 3) {
    return null;
  }

  const status = data[0] & 0xf0;
  const number = data[1];
  const value = data[2];
  if (number > 127 || value > 127) {
    return null;
  }

  switch (status) {
    case CONTROL_CHANGE:
      return { controlId: number, value };
    case NOTE_ON:
      // Una nota con velocidad 0 es, por convencion, una nota soltada.
      return value === 0 ? null : { controlId: NOTE_ID_OFFSET + number, value };
    case NOTE_OFF:
    default:
      return null;
  }
}
