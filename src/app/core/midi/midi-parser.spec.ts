import { NOTE_ID_OFFSET, parseMidiMessage } from './midi-parser';

describe('parseMidiMessage', () => {
  describe('Control Change (faders y perillas)', () => {
    it('convierte un CC en controlId y valor', () => {
      expect(parseMidiMessage([0xb0, 14, 127])).toEqual({ controlId: 14, value: 127, channel: 0 });
    });

    it('acepta el valor 0, que es MIDI valido', () => {
      expect(parseMidiMessage([0xb0, 14, 0])).toEqual({ controlId: 14, value: 0, channel: 0 });
    });

    it('devuelve el canal por el que llego, sin cambiar el controlId', () => {
      for (let canal = 0; canal < 16; canal++) {
        expect(parseMidiMessage([0xb0 | canal, 7, 64])).toEqual({ controlId: 7, value: 64, channel: canal });
      }
    });

    it('acepta un Uint8Array, que es lo que entrega la Web MIDI API', () => {
      expect(parseMidiMessage(new Uint8Array([0xb0, 21, 100]))).toEqual({ controlId: 21, value: 100, channel: 0 });
    });
  });

  describe('notas (botones y pads)', () => {
    it('una nota pulsada se identifica con el desplazamiento de notas', () => {
      expect(parseMidiMessage([0x90, 36, 100])).toEqual({ controlId: NOTE_ID_OFFSET + 36, value: 100, channel: 0 });
    });

    it('una nota no choca con el CC del mismo numero', () => {
      const nota = parseMidiMessage([0x90, 14, 100]);
      const cc = parseMidiMessage([0xb0, 14, 100]);

      expect(nota?.controlId).not.toBe(cc?.controlId);
    });

    it('una nota tambien lleva su canal', () => {
      expect(parseMidiMessage([0x93, 36, 100])).toEqual({ controlId: NOTE_ID_OFFSET + 36, value: 100, channel: 3 });
    });

    it('una nota con velocidad 0 es una nota soltada y se ignora', () => {
      expect(parseMidiMessage([0x90, 36, 0])).toBeNull();
    });

    it('un Note Off se ignora', () => {
      expect(parseMidiMessage([0x80, 36, 64])).toBeNull();
    });
  });

  describe('mensajes que no son de control', () => {
    it('ignora reloj, pitch bend y program change', () => {
      expect(parseMidiMessage([0xf8])).toBeNull(); // reloj
      expect(parseMidiMessage([0xe0, 0, 64])).toBeNull(); // pitch bend
      expect(parseMidiMessage([0xc0, 5, 0])).toBeNull(); // program change
    });

    it('ignora mensajes incompletos', () => {
      expect(parseMidiMessage([0xb0])).toBeNull();
      expect(parseMidiMessage([0xb0, 14])).toBeNull();
      expect(parseMidiMessage([])).toBeNull();
    });

    it('ignora datos nulos o indefinidos', () => {
      expect(parseMidiMessage(null)).toBeNull();
      expect(parseMidiMessage(undefined)).toBeNull();
    });

    it('rechaza bytes de datos fuera de 0-127', () => {
      expect(parseMidiMessage([0xb0, 14, 200])).toBeNull();
      expect(parseMidiMessage([0xb0, 200, 10])).toBeNull();
    });
  });
});
