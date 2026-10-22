import {
  MIXER_CONTROLS,
  MixerControl,
  controlLabel,
  isButton,
  isMixerControl,
  mappingKey,
  midiControlLabel,
  parseMappingKey,
  valueToPitch,
  valueToUnit,
} from './midi-mapping';

describe('MIXER_CONTROLS', () => {
  it('incluye el crossfader y el volumen maestro', () => {
    expect(MIXER_CONTROLS).toContain('crossfader');
    expect(MIXER_CONTROLS).toContain('masterVolume');
  });

  it('cada deck tiene volumen, pitch, tres bandas de EQ y tres botones', () => {
    for (const deck of ['A', 'B']) {
      for (const control of ['volume', 'pitch', 'eq.low', 'eq.mid', 'eq.high', 'play', 'cue', 'sync']) {
        expect(MIXER_CONTROLS).toContain(`${deck}.${control}` as MixerControl);
      }
    }
  });

  it('no tiene controles repetidos', () => {
    expect(new Set(MIXER_CONTROLS).size).toBe(MIXER_CONTROLS.length);
  });

  it('son 2 globales mas 8 por deck', () => {
    expect(MIXER_CONTROLS.length).toBe(2 + 2 * 8);
  });
});

describe('isButton', () => {
  it('play, cue y sync son botones', () => {
    for (const control of ['A.play', 'B.cue', 'A.sync'] as MixerControl[]) {
      expect(isButton(control)).toBe(true);
    }
  });

  it('faders y perillas no son botones', () => {
    for (const control of ['crossfader', 'masterVolume', 'A.volume', 'B.pitch', 'A.eq.low'] as MixerControl[]) {
      expect(isButton(control)).toBe(false);
    }
  });

  it('exactamente 6 controles son botones', () => {
    expect(MIXER_CONTROLS.filter(isButton).length).toBe(6);
  });
});

describe('isMixerControl', () => {
  it('acepta los controles conocidos y rechaza el resto', () => {
    expect(isMixerControl('A.eq.mid')).toBe(true);
    expect(isMixerControl('C.volume')).toBe(false);
    expect(isMixerControl('A.eq.bass')).toBe(false);
    expect(isMixerControl(42)).toBe(false);
    expect(isMixerControl(null)).toBe(false);
  });
});

describe('etiquetas', () => {
  it('nombra cada tipo de control en espanol', () => {
    expect(controlLabel('crossfader')).toBe('Crossfader');
    expect(controlLabel('masterVolume')).toBe('Volumen maestro');
    expect(controlLabel('A.volume')).toBe('Deck A: volumen');
    expect(controlLabel('B.pitch')).toBe('Deck B: pitch');
    expect(controlLabel('A.eq.low')).toBe('Deck A: EQ graves');
    expect(controlLabel('B.eq.mid')).toBe('Deck B: EQ medios');
    expect(controlLabel('A.eq.high')).toBe('Deck A: EQ agudos');
    expect(controlLabel('B.play')).toBe('Deck B: play/pausa');
    expect(controlLabel('A.cue')).toBe('Deck A: cue');
    expect(controlLabel('B.sync')).toBe('Deck B: sync');
  });

  it('todos los controles tienen una etiqueta distinta', () => {
    expect(new Set(MIXER_CONTROLS.map(controlLabel)).size).toBe(MIXER_CONTROLS.length);
  });

  it('los CC y las notas MIDI se muestran por separado', () => {
    expect(midiControlLabel(14)).toBe('CC 14');
    expect(midiControlLabel(0)).toBe('CC 0');
    expect(midiControlLabel(127)).toBe('CC 127');
    expect(midiControlLabel(128)).toBe('Nota 0');
    expect(midiControlLabel(164)).toBe('Nota 36');
    expect(midiControlLabel(14, 0)).toBe('Canal 1 · CC 14');
    expect(midiControlLabel(164, 15)).toBe('Canal 16 · Nota 36');
  });
});

describe('valueToUnit', () => {
  it('lleva 0-127 a 0-1', () => {
    expect(valueToUnit(0)).toBe(0);
    expect(valueToUnit(127)).toBe(1);
    expect(valueToUnit(63.5)).toBeCloseTo(0.5);
  });

  it('limita los valores fuera de rango', () => {
    expect(valueToUnit(-5)).toBe(0);
    expect(valueToUnit(300)).toBe(1);
  });
});

describe('valueToPitch', () => {
  it('el extremo bajo es -8 % y el alto +8 %', () => {
    expect(valueToPitch(0)).toBeCloseTo(0.92);
    expect(valueToPitch(127)).toBeCloseTo(1.08);
  });

  it('el centro es exactamente 1 (sin cambio) aunque el fader no caiga justo en 63.5', () => {
    expect(valueToPitch(63)).toBe(1);
    expect(valueToPitch(64)).toBe(1);
  });

  it('es creciente', () => {
    let anterior = 0;
    for (let v = 0; v <= 127; v++) {
      expect(valueToPitch(v)).toBeGreaterThanOrEqual(anterior);
      anterior = valueToPitch(v);
    }
  });

  it('nunca sale del rango del pitch fader', () => {
    for (let v = -10; v <= 140; v++) {
      expect(valueToPitch(v)).toBeGreaterThanOrEqual(0.92 - 1e-9);
      expect(valueToPitch(v)).toBeLessThanOrEqual(1.08 + 1e-9);
    }
  });
});

describe('clave de asignacion', () => {
  it('sin canal es solo el controlId y con canal lleva el canal delante', () => {
    expect(mappingKey(14)).toBe('14');
    expect(mappingKey(14, null)).toBe('14');
    expect(mappingKey(14, 0)).toBe('0:14');
    expect(mappingKey(164, 15)).toBe('15:164');
  });

  it('se puede leer de vuelta', () => {
    expect(parseMappingKey('14')).toEqual({ channel: null, controlId: 14 });
    expect(parseMappingKey('0:14')).toEqual({ channel: 0, controlId: 14 });
    expect(parseMappingKey('15:255')).toEqual({ channel: 15, controlId: 255 });
    expect(parseMappingKey('007')).toEqual({ channel: null, controlId: 7 });
  });

  it('rechaza lo que no es una clave valida', () => {
    for (const clave of ['', 'abc', '-3', '256', '16:7', '1:300', '1:', ':7', '1:2:3', '1.5', ' 7']) {
      expect(parseMappingKey(clave), clave).toBeNull();
    }
  });
});
