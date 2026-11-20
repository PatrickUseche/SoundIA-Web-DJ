import { Track } from '../models/track';
import { alignmentLevel, nearestOnGrid, nextOnGrid, phaseShift, planAlignment } from './beatgrid';

const trackItem = (bpm: number, grid: Track['grid'], id = 1): Track => ({
  id, title: `pista ${id}`, duration: 200, bpm, key: 'C major', camelot: '8B', energy: 0.6,
  cuePoints: [0], hasAudio: true, createdAt: 'x', grid,
});

/** Rejilla con compases claros: el primer tiempo en `downbeat` y el primer pulso en `offset`. */
const rejilla = (offset: number, downbeat: number, confidence = 0.9): Track['grid'] => ({ offset, downbeat, confidence });

describe('nextOnGrid', () => {
  it('es el primer punto de la rejilla que no es anterior al instante dado', () => {
    expect(nextOnGrid(0.1, 0.5, 10.3)).toBeCloseTo(10.6);
    expect(nextOnGrid(0.1, 0.5, 10.6)).toBeCloseTo(10.6);
    expect(nextOnGrid(0.1, 0.5, 10.61)).toBeCloseTo(11.1);
  });

  it('funciona con un origen negativo (un golpe justo antes de empezar el audio)', () => {
    expect(nextOnGrid(-0.003, 0.5, 0)).toBeCloseTo(0.497);
    expect(nextOnGrid(-0.003, 0.5, -0.003)).toBeCloseTo(-0.003);
  });

  it('un instante que coincide con un punto de la rejilla se devuelve a si mismo (sin errores de redondeo)', () => {
    expect(nextOnGrid(0.583, 2.1818181818, 0.583 + 2.1818181818 * 7)).toBeCloseTo(0.583 + 2.1818181818 * 7, 6);
  });
});

describe('nearestOnGrid', () => {
  it('es el punto de la rejilla mas cercano al instante dado', () => {
    expect(nearestOnGrid(0.1, 0.5, 10.3)).toBeCloseTo(10.1);
    expect(nearestOnGrid(0.1, 0.5, 10.4)).toBeCloseTo(10.6);
  });
});

describe('alignmentLevel', () => {
  it('con las dos rejillas seguras se alinea por compases', () => {
    expect(alignmentLevel(trackItem(120, rejilla(0, 0)), trackItem(122, rejilla(0.1, 0.1), 2))).toBe('bar');
  });

  it('si en alguna no se sabe cual es el primer tiempo, se alinea solo por pulsos', () => {
    expect(alignmentLevel(trackItem(120, rejilla(0, 0, 0.9)), trackItem(122, rejilla(0.1, 0.1, 0.03), 2))).toBe('beat');
  });

  it('sin rejilla en alguna de las dos no se puede alinear', () => {
    expect(alignmentLevel(trackItem(120, null), trackItem(122, rejilla(0, 0), 2))).toBeNull();
    expect(alignmentLevel(trackItem(120, rejilla(0, 0)), trackItem(122, undefined, 2))).toBeNull();
  });
});

describe('phaseShift', () => {
  // Las dos a 120 BPM (pulso de 0.5 s) con el primer pulso en 0.
  const guia = trackItem(120, rejilla(0, 0));
  const seguidora = trackItem(120, rejilla(0, 0), 2);
  const base = { leader: guia, leaderPosition: 10.3, leaderRate: 1, follower: seguidora, followerPosition: 10.2, followerRate: 1 };

  it('adelanta la seguidora si va retrasada respecto a los pulsos de la guia', () => {
    // A la guia le faltan 0.2 s para su pulso (10.5) y a la seguidora 0.3 s: va 0.1 s retrasada, hay que adelantarla.
    expect(phaseShift(base)).toBeCloseTo(0.1);
  });

  it('atrasa la seguidora si va adelantada', () => {
    expect(phaseShift({ ...base, followerPosition: 10.4 })).toBeCloseTo(-0.1);
  });

  it('no mueve nada si ya estan en fase', () => {
    expect(phaseShift({ ...base, followerPosition: 10.3 })).toBeCloseTo(0);
    expect(phaseShift({ ...base, followerPosition: 7.8 })).toBeCloseTo(0); // 5 pulsos antes: misma fase
  });

  it('elige el camino mas corto: como mucho medio pulso en cualquier sentido', () => {
    for (let currentPosition = 10.0; currentPosition < 11.0; currentPosition += 0.013) {
      const displacement = phaseShift({ ...base, followerPosition: currentPosition })!;
      expect(Math.abs(displacement)).toBeLessThanOrEqual(0.25 + 1e-9);
    }
  });

  it('tras mover la seguidora sus pulsos caen sobre los de la guia', () => {
    const displacement = phaseShift({ ...base, followerPosition: 10.17 })!;

    const pulsos = (((10.17 + displacement) - 0) / 0.5) % 1;
    const pulsoGuia = ((10.3 - 0) / 0.5) % 1;
    expect(pulsos).toBeCloseTo(pulsoGuia, 6);
  });

  it('con una rejilla desplazada tiene en cuenta el primer pulso de cada pista', () => {
    const conOffset = trackItem(120, rejilla(0.2, 0.2), 2);

    // Los pulsos de la guia caen en 10.5; los de la seguidora (primer pulso en 0.2) en 10.7: va 0.2 s retrasada.
    expect(phaseShift({ ...base, follower: conOffset, followerPosition: 10.3 })).toBeCloseTo(0.2);
  });

  it('tiene en cuenta el pitch: a otro ritmo de reloj, los segundos de pista se escalan', () => {
    // La seguidora va un 5 % mas rapida: le faltan 0.3 s de pista (0.286 s de reloj) frente a 0.2 s de la guia, asi que
    // el desfase de reloj es 0.0857 s, que son 0.09 s de pista.
    expect(phaseShift({ ...base, followerRate: 1.05 })).toBeCloseTo(0.09);
  });

  it('sin rejilla en alguna de las dos no hay desplazamiento', () => {
    expect(phaseShift({ ...base, leader: trackItem(120, null) })).toBeNull();
    expect(phaseShift({ ...base, follower: trackItem(120, undefined, 2) })).toBeNull();
  });
});

describe('planAlignment', () => {
  // A a 120 BPM (pulso 0.5 s, compas 2 s) con el primer tiempo en 0; B a 124 BPM con el primer tiempo en 0.2.
  const A = trackItem(120, rejilla(0, 0));
  const B = trackItem(124, rejilla(0.2, 0.2), 2);
  const base = { outgoing: A, incoming: B, outgoingPosition: 10.3, outgoingRate: 1, multiplier: 1, mixInAt: 0.2, minLeadSeconds: 0.15 };

  it('espera al proximo compas de la pista que suena', () => {
    const plan = planAlignment(base)!;

    expect(plan.level).toBe('bar');
    expect(plan.delaySeconds).toBeCloseTo(1.7); // el compas siguiente empieza en 12.0
  });

  it('dice en que punto de la saliente cae el compas elegido', () => {
    expect(planAlignment(base)!.outgoingTarget).toBeCloseTo(12.0);
    expect(planAlignment({ ...base, notBefore: 16.0 })!.outgoingTarget).toBeCloseTo(16.0);
  });

  it('arranca la entrante en su primer tiempo mas cercano al punto de entrada del plan', () => {
    expect(planAlignment(base)!.incomingStart).toBeCloseTo(0.2);
    expect(planAlignment({ ...base, mixInAt: 6.5 })!.incomingStart).toBeCloseTo(0.2 + (60 / 124) * 4 * 3); // 3 compases
  });

  it('iguala el tempo de la entrante al que suena ahora, no al nominal de la pista saliente', () => {
    expect(planAlignment(base)!.ratio).toBeCloseTo(120 / 124);
    // La saliente va acelerada un 3 %: suena a 123.6 BPM.
    expect(planAlignment({ ...base, outgoingRate: 1.03 })!.ratio).toBeCloseTo(123.6 / 124);
  });

  it('si la saliente va mas rapida, el tiempo hasta el compas es menor (la pista avanza mas por segundo)', () => {
    expect(planAlignment({ ...base, outgoingRate: 1.05 })!.delaySeconds).toBeCloseTo(1.7 / 1.05);
  });

  it('deja un margen minimo para poder programar el arranque', () => {
    // Faltan 0.1 s para el compas (en 12.0): no da tiempo, se espera al siguiente.
    expect(planAlignment({ ...base, outgoingPosition: 11.9 })!.delaySeconds).toBeCloseTo(2.1);
    expect(planAlignment({ ...base, outgoingPosition: 11.8 })!.delaySeconds).toBeCloseTo(0.2);
  });

  it('con "no antes de" no se adelanta al punto de salida planeado', () => {
    // Estamos en 10.3 y el plan sale en 16.0 (otro compas): no se arranca en el compas de 12.0.
    expect(planAlignment({ ...base, notBefore: 16.0 })!.delaySeconds).toBeCloseTo(5.7);
  });

  it('con compas incierto alinea por pulsos', () => {
    const incierta = trackItem(124, rejilla(0.2, 0.2, 0.01), 2);

    const plan = planAlignment({ ...base, incoming: incierta, outgoingPosition: 10.3 })!;

    expect(plan.level).toBe('beat');
    expect(plan.delaySeconds).toBeCloseTo(0.2); // el proximo pulso de A cae en 10.5
    expect(plan.incomingStart).toBeCloseTo(0.2); // el pulso de B mas cercano al punto de entrada
  });

  it('sin rejilla en alguna pista no hay alineacion', () => {
    expect(planAlignment({ ...base, incoming: trackItem(124, null, 2) })).toBeNull();
  });

  it('si el tempo no cabe en el pitch fader no hay alineacion', () => {
    expect(planAlignment({ ...base, incoming: trackItem(140, rejilla(0, 0), 2) })).toBeNull();
  });

  describe('con el motor mezclando a la mitad o al doble de tempo', () => {
    /**
     * Instantes (en tiempo de la saliente) en que caen los primeros pulsos o compases de la entrante una vez
     * arrancada, expresados en pulsos o compases de la saliente: deben ser enteros para que coincidan.
     */
    const posiciones = (plan: NonNullable<ReturnType<typeof planAlignment>>, a: Track, b: Track, unidad: number) =>
      Array.from({ length: 8 }, (_, k) => {
        const duracionEntrante = ((unidad * 60) / b.bpm) / plan.ratio; // s de reloj por pulso (o compas) de la entrante
        const instante = plan.outgoingTarget + k * duracionEntrante;
        const origen = unidad === 4 ? a.grid!.downbeat : a.grid!.offset;
        return (instante - origen) / ((unidad * 60) / a.bpm);
      });

    it('la entrante a la mitad de tempo (multiplicador 2) se alinea y sus golpes caen sobre los de la saliente', () => {
      const lenta = trackItem(70, rejilla(0.2, 0.2), 3);
      const rapida = trackItem(140, rejilla(0, 0));

      const plan = planAlignment({ ...base, outgoing: rapida, incoming: lenta, multiplier: 2 })!;

      expect(plan.level).toBe('bar');
      expect(plan.ratio).toBeCloseTo(1); // 140 / (70 * 2): suena a su ritmo natural
      for (const unidad of [1, 4]) {
        for (const currentPosition of posiciones(plan, rapida, lenta, unidad)) {
          expect(currentPosition).toBeCloseTo(Math.round(currentPosition), 6);
        }
      }
      // Cada pulso de la entrante cae sobre uno de cada dos pulsos de la saliente.
      const [p0, p1] = posiciones(plan, rapida, lenta, 1);
      expect(p1 - p0).toBeCloseTo(2);
    });

    it('la entrante al doble de tempo (multiplicador 0.5) se alinea y sus golpes caen sobre los de la saliente', () => {
      const rapidisima = trackItem(280, rejilla(0.05, 0.05), 3);
      const lenta = trackItem(140, rejilla(0, 0));

      const plan = planAlignment({ ...base, outgoing: lenta, incoming: rapidisima, multiplier: 0.5 })!;

      expect(plan.ratio).toBeCloseTo(1); // 140 / (280 * 0.5)
      const pulsos = posiciones(plan, lenta, rapidisima, 1);
      // Dos pulsos de la entrante por cada uno de la saliente: coincide uno de cada dos y el otro cae justo en medio.
      pulsos.forEach((currentPosition, k) => {
        const esperado = k % 2 === 0 ? Math.round(currentPosition) : Math.round(currentPosition - 0.5) + 0.5;
        expect(currentPosition).toBeCloseTo(esperado, 6);
      });
      expect(pulsos[1] - pulsos[0]).toBeCloseTo(0.5);
    });

    it('el factor de pitch incluye el multiplicador', () => {
      const lenta = trackItem(68, rejilla(0, 0), 3);
      const rapida = trackItem(140, rejilla(0, 0));

      expect(planAlignment({ ...base, outgoing: rapida, incoming: lenta, multiplier: 2 })!.ratio).toBeCloseTo(140 / 136);
    });

    it('si con el multiplicador el tempo sigue sin caber en el pitch fader no hay alineacion', () => {
      const lenta = trackItem(100, rejilla(0, 0), 3);
      const rapida = trackItem(140, rejilla(0, 0));

      expect(planAlignment({ ...base, outgoing: rapida, incoming: lenta, multiplier: 2 })).toBeNull();
    });

    it('un multiplicador no positivo no se alinea', () => {
      expect(planAlignment({ ...base, multiplier: 0 })).toBeNull();
    });
  });

  it('el punto de entrada nunca es negativo', () => {
    const plan = planAlignment({ ...base, incoming: trackItem(124, rejilla(-0.003, -0.003), 2), mixInAt: 0 })!;

    expect(plan.incomingStart).toBeGreaterThanOrEqual(0);
    expect(plan.incomingStart).toBeCloseTo(-0.003 + (60 / 124) * 4);
  });
});
