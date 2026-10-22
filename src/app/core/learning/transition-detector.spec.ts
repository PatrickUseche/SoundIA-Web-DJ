import {
  ABORT_HOLD_SECONDS,
  AUDIBLE_LEVEL,
  DeckSample,
  END_HOLD_SECONDS,
  MAX_CURVE_POINTS,
  MAX_OVERLAP_SECONDS,
  MIN_OVERLAP_SECONDS,
  MixSample,
  RecordedTransition,
  SETTLE_SECONDS,
  TAIL_SECONDS,
  TransitionDetector,
  downsample,
  isAudible,
} from './transition-detector';

const deck = (cambios: Partial<DeckSample> = {}): DeckSample => ({
  trackId: 1, playing: true, position: 100, pitch: 1, volume: 1, gain: 1, eq: { low: 0.5, mid: 0.5, high: 0.5 },
  ...cambios,
});

const mudo = (cambios: Partial<DeckSample> = {}) => deck({ playing: false, ...cambios });

const muestra = (time: number, a: DeckSample, b: DeckSample, crossfader = 0.5): MixSample => ({
  time, crossfader, decks: { A: a, B: b },
});

describe('isAudible', () => {
  it('suena si reproduce y volumen por ganancia superan el umbral', () => {
    expect(isAudible(deck())).toBe(true);
    expect(isAudible(deck({ volume: 0.5, gain: 0.5 }))).toBe(true);
  });

  it('no suena parado, sin pista o por debajo del umbral', () => {
    expect(isAudible(deck({ playing: false }))).toBe(false);
    expect(isAudible(deck({ trackId: null }))).toBe(false);
    expect(isAudible(deck({ volume: 1, gain: AUDIBLE_LEVEL }))).toBe(false);
    expect(isAudible(deck({ volume: 0 }))).toBe(false);
  });
});

describe('downsample', () => {
  const curva = (n: number): [number, number][] => Array.from({ length: n }, (_, i) => [i, i / n]);

  it('no toca una curva que ya cabe', () => {
    expect(downsample(curva(10), 150)).toEqual(curva(10));
  });

  it('reduce al limite conservando el primer y el ultimo punto, en orden', () => {
    const reducida = downsample(curva(1000), 150);

    expect(reducida.length).toBe(150);
    expect(reducida[0]).toEqual([0, 0]);
    expect(reducida[149]).toEqual([999, 999 / 1000]);
    for (let i = 1; i < reducida.length; i++) {
      expect(reducida[i][0]).toBeGreaterThan(reducida[i - 1][0]);
    }
  });
});

describe('TransitionDetector', () => {
  let detector: TransitionDetector;
  let resultados: RecordedTransition[];

  beforeEach(() => {
    detector = new TransitionDetector();
    resultados = [];
  });

  const alimentar = (m: MixSample) => {
    const r = detector.push(m);
    if (r) {
      resultados.push(r);
    }
    return r;
  };

  /**
   * Una mezcla clasica: A suena sola `solo` segundos; entonces entra B y durante `solape` segundos el crossfader va
   * de A a B (y los graves de A se cortan a la mitad); despues A se apaga y B sigue sola `despues` segundos.
   */
  function mezclaClasica(opciones: { solo?: number; solape?: number; despues?: number; paso?: number } = {}) {
    const { solo = 5, solape = 16, despues = 3, paso = 0.05 } = opciones;
    let t = 0;
    for (; t < solo; t += paso) {
      alimentar(muestra(t, deck({ trackId: 1, position: 100 + t }), mudo({ trackId: 2, position: 0 }), 0));
    }
    const entrada = t;
    for (; t < entrada + solape; t += paso) {
      const p = (t - entrada) / solape;
      const crossfader = p;
      alimentar(muestra(
        t,
        deck({ trackId: 1, position: 100 + t, gain: Math.cos((p * Math.PI) / 2), eq: { low: p < 0.5 ? 0.5 : 0, mid: 0.5, high: 0.5 } }),
        deck({ trackId: 2, position: 4 + (t - entrada), pitch: 1.02, gain: Math.sin((p * Math.PI) / 2) }),
        crossfader,
      ));
    }
    for (let i = 0; i * paso < despues; i++, t += paso) {
      alimentar(muestra(t, mudo({ trackId: 1, position: 100 + t, gain: 0 }), deck({ trackId: 2, position: 4 + (t - entrada) }), 1));
    }
    return { entrada, fin: entrada + solape };
  }

  it('detecta una mezcla clasica con lo que hizo el DJ', () => {
    mezclaClasica();

    expect(resultados.length).toBe(1);
    const mezcla = resultados[0];
    expect(mezcla.fromDeck).toBe('A');
    expect(mezcla.toDeck).toBe('B');
    expect(mezcla.fromTrackId).toBe(1);
    expect(mezcla.toTrackId).toBe(2);
    // B "entra" cuando empieza a oirse (medio segundo despues de mover el crossfader): A iba por el 105,x y B por el 4,x.
    expect(mezcla.mixOutAt).toBeGreaterThan(105);
    expect(mezcla.mixOutAt).toBeLessThan(106.5);
    expect(mezcla.mixInAt).toBeGreaterThan(4);
    expect(mezcla.mixInAt).toBeLessThan(5.5);
    expect(mezcla.pitchA).toBe(1);
    expect(mezcla.pitchB).toBe(1.02);
    expect(mezcla.overlapSeconds).toBeGreaterThan(14);
    expect(mezcla.overlapSeconds).toBeLessThanOrEqual(16.5);
  });

  it('guarda las curvas relativas a la entrada de B, de 0 a 1, en orden y sin pasar del limite', () => {
    mezclaClasica();

    const { curves, overlapSeconds } = resultados[0];
    for (const curva of [curves.crossfader, curves.a.volume, curves.a.low, curves.b.volume, curves.b.high]) {
      expect(curva.length).toBeGreaterThan(1);
      expect(curva.length).toBeLessThanOrEqual(MAX_CURVE_POINTS);
      expect(curva[0][0]).toBe(0);
      expect(curva[curva.length - 1][0]).toBeLessThanOrEqual(overlapSeconds + TAIL_SECONDS + 1e-9);
      curva.forEach(([t, v], i) => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
        if (i > 0) {
          expect(t).toBeGreaterThan(curva[i - 1][0]);
        }
      });
    }
    expect(curves.crossfader[0][1]).toBeCloseTo(0, 1);
    expect(curves.crossfader[curves.crossfader.length - 1][1]).toBeGreaterThan(0.9);
  });

  it('recoge el corte de graves de la pista que sale', () => {
    mezclaClasica();

    const graves = resultados[0].curves.a.low;
    expect(graves[0][1]).toBe(0.5);
    expect(graves[graves.length - 1][1]).toBe(0);
  });

  it('si sale el deck B la curva del crossfader se normaliza: 0 = pista que sale, 1 = la que entra', () => {
    let t = 0;
    for (; t < 3; t += 0.05) {
      alimentar(muestra(t, mudo({ trackId: 2 }), deck({ trackId: 1, position: 50 + t }), 1));
    }
    const entrada = t;
    for (; t < entrada + 8; t += 0.05) {
      const p = (t - entrada) / 8;
      // El crossfader va de B (1) hacia A (0).
      // Crossfader en 1 - p: la ganancia del deck A es cos(cf * pi / 2) y la del B sin(cf * pi / 2).
      alimentar(muestra(t, deck({ trackId: 2, gain: Math.cos(((1 - p) * Math.PI) / 2) }), deck({ trackId: 1, position: 50 + t, gain: Math.sin(((1 - p) * Math.PI) / 2) }), 1 - p));
    }
    for (let i = 0; i < 40; i++, t += 0.05) {
      alimentar(muestra(t, deck({ trackId: 2 }), mudo({ trackId: 1, gain: 0 }), 0));
    }

    expect(resultados.length).toBe(1);
    expect(resultados[0].fromDeck).toBe('B');
    expect(resultados[0].toDeck).toBe('A');
    const fader = resultados[0].curves.crossfader;
    expect(fader[0][1]).toBeCloseTo(0, 1);
    expect(fader[fader.length - 1][1]).toBeGreaterThan(0.9);
  });

  it('un corte seco tambien cuenta, con el solape minimo', () => {
    let t = 0;
    for (; t < 3; t += 0.05) {
      alimentar(muestra(t, deck({ trackId: 1 }), mudo({ trackId: 2 }), 0));
    }
    alimentar(muestra(t, deck({ trackId: 1 }), deck({ trackId: 2, position: 8 }), 0.5));
    t += 0.05;
    for (let i = 0; i < 60; i++, t += 0.05) {
      alimentar(muestra(t, mudo({ trackId: 1, gain: 0 }), deck({ trackId: 2, position: 8 + i * 0.05 }), 1));
    }

    expect(resultados.length).toBe(1);
    expect(resultados[0].overlapSeconds).toBe(MIN_OVERLAP_SECONDS);
    expect(resultados[0].mixInAt).toBe(8);
  });

  it('despues de una mezcla puede detectar la siguiente, con B como pista que sale', () => {
    mezclaClasica();
    expect(resultados.length).toBe(1);
    // B (pista 2, deck B) sigue sonando sola; entra una tercera pista en el deck A.
    let t = 40;
    for (; t < 44; t += 0.05) {
      alimentar(muestra(t, mudo({ trackId: 3 }), deck({ trackId: 2, position: 40 + t }), 1));
    }
    const entrada = t;
    for (; t < entrada + 6; t += 0.05) {
      const p = (t - entrada) / 6;
      alimentar(muestra(t, deck({ trackId: 3, gain: Math.cos(((1 - p) * Math.PI) / 2) }), deck({ trackId: 2, position: 40 + t, gain: Math.cos((p * Math.PI) / 2) }), 1 - p));
    }
    for (let i = 0; i < 40; i++, t += 0.05) {
      alimentar(muestra(t, deck({ trackId: 3 }), mudo({ trackId: 2, gain: 0 }), 0));
    }

    expect(resultados.length).toBe(2);
    expect(resultados[1].fromTrackId).toBe(2);
    expect(resultados[1].toTrackId).toBe(3);
  });

  describe('lo que no es una mezcla', () => {
    it('una pista sola sonando no genera nada', () => {
      for (let t = 0; t < 60; t += 0.05) {
        alimentar(muestra(t, deck(), mudo({ trackId: 2 })));
      }

      expect(resultados.length).toBe(0);
      expect(detector.recording).toBe(false);
    });

    it('las dos sonando desde el principio no cuentan (no hubo una pista sola antes)', () => {
      for (let t = 0; t < 30; t += 0.05) {
        alimentar(muestra(t, deck({ trackId: 1 }), deck({ trackId: 2 })));
      }
      for (let t = 30; t < 33; t += 0.05) {
        alimentar(muestra(t, mudo({ trackId: 1 }), deck({ trackId: 2 })));
      }

      expect(resultados.length).toBe(0);
      expect(detector.recording).toBe(false);
    });

    it('una entrada antes de que la base lleve sonando sola el tiempo minimo no cuenta', () => {
      for (let t = 0; t < SETTLE_SECONDS - 0.2; t += 0.05) {
        alimentar(muestra(t, deck({ trackId: 1 }), mudo({ trackId: 2 })));
      }
      alimentar(muestra(SETTLE_SECONDS - 0.1, deck({ trackId: 1 }), deck({ trackId: 2 })));

      expect(detector.recording).toBe(false);
    });

    it('si B entra y el DJ se arrepiente (B se apaga) no se guarda nada', () => {
      let t = 0;
      for (; t < 3; t += 0.05) {
        alimentar(muestra(t, deck({ trackId: 1 }), mudo({ trackId: 2 })));
      }
      for (let i = 0; i < 40; i++, t += 0.05) {
        alimentar(muestra(t, deck({ trackId: 1 }), deck({ trackId: 2, gain: 0.5 })));
      }
      expect(detector.recording).toBe(true);
      for (let i = 0; i < (ABORT_HOLD_SECONDS + 1) / 0.05; i++, t += 0.05) {
        alimentar(muestra(t, deck({ trackId: 1 }), mudo({ trackId: 2 })));
      }

      expect(resultados.length).toBe(0);
      expect(detector.recording).toBe(false);
    });

    it('si A se apaga antes de que entre B no hay solape', () => {
      let t = 0;
      for (; t < 3; t += 0.05) {
        alimentar(muestra(t, deck({ trackId: 1 }), mudo({ trackId: 2 })));
      }
      for (let i = 0; i < 60; i++, t += 0.05) {
        alimentar(muestra(t, mudo({ trackId: 1 }), mudo({ trackId: 2 })));
      }
      for (let i = 0; i < 60; i++, t += 0.05) {
        alimentar(muestra(t, mudo({ trackId: 1 }), deck({ trackId: 2 })));
      }

      expect(resultados.length).toBe(0);
    });

    it('las mismas pistas en los dos decks no cuentan', () => {
      let t = 0;
      for (; t < 3; t += 0.05) {
        alimentar(muestra(t, deck({ trackId: 7 }), mudo({ trackId: 7 })));
      }
      alimentar(muestra(t, deck({ trackId: 7 }), deck({ trackId: 7 })));

      expect(detector.recording).toBe(false);
    });

    it('un deck sin pista de la biblioteca (archivo local) no cuenta', () => {
      let t = 0;
      for (; t < 3; t += 0.05) {
        alimentar(muestra(t, deck({ trackId: 1 }), mudo({ trackId: null })));
      }
      alimentar(muestra(t, deck({ trackId: 1 }), deck({ trackId: null })));

      expect(detector.recording).toBe(false);
    });

    it('si se cambia una de las pistas durante la mezcla se descarta', () => {
      let t = 0;
      for (; t < 3; t += 0.05) {
        alimentar(muestra(t, deck({ trackId: 1 }), mudo({ trackId: 2 })));
      }
      for (let i = 0; i < 20; i++, t += 0.05) {
        alimentar(muestra(t, deck({ trackId: 1 }), deck({ trackId: 2 })));
      }
      expect(detector.recording).toBe(true);

      alimentar(muestra(t, deck({ trackId: 9 }), deck({ trackId: 2 })));

      expect(detector.recording).toBe(false);
      expect(resultados.length).toBe(0);
    });

    it('una mezcla que no acaba nunca se descarta pasado el maximo', () => {
      let t = 0;
      for (; t < 3; t += 0.5) {
        alimentar(muestra(t, deck({ trackId: 1 }), mudo({ trackId: 2 })));
      }
      for (let i = 0; i * 5 < MAX_OVERLAP_SECONDS + 20; i++, t += 5) {
        alimentar(muestra(t, deck({ trackId: 1 }), deck({ trackId: 2 })));
      }

      expect(detector.recording).toBe(false);
      expect(resultados.length).toBe(0);
    });

    it('pausar la pista que sale a mitad del solape tambien la da por acabada', () => {
      let t = 0;
      for (; t < 3; t += 0.05) {
        alimentar(muestra(t, deck({ trackId: 1 }), mudo({ trackId: 2 })));
      }
      for (let i = 0; i < 60; i++, t += 0.05) {
        alimentar(muestra(t, deck({ trackId: 1 }), deck({ trackId: 2 })));
      }
      for (let i = 0; i < (END_HOLD_SECONDS + 1) / 0.05; i++, t += 0.05) {
        alimentar(muestra(t, mudo({ trackId: 1 }), deck({ trackId: 2 })));
      }

      expect(resultados.length).toBe(1);
      expect(resultados[0].overlapSeconds).toBeGreaterThan(2.9);
    });
  });

  it('reset olvida la mezcla en curso', () => {
    let t = 0;
    for (; t < 3; t += 0.05) {
      alimentar(muestra(t, deck({ trackId: 1 }), mudo({ trackId: 2 })));
    }
    alimentar(muestra(t, deck({ trackId: 1 }), deck({ trackId: 2 })));
    expect(detector.recording).toBe(true);

    detector.reset();

    expect(detector.recording).toBe(false);
  });
});
