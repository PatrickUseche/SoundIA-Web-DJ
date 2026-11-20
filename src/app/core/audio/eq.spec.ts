import { EQ_BOOST_DB, EQ_KILL_DB, dbToEqValue, eqValueToDb } from './eq';

describe('eqValueToDb', () => {
  it('con la perilla al minimo corta la banda', () => {
    expect(eqValueToDb(0)).toBe(EQ_KILL_DB);
  });

  it('en la posicion central deja la banda plana', () => {
    expect(eqValueToDb(0.5)).toBe(0);
  });

  it('con la perilla al maximo realza la banda', () => {
    expect(eqValueToDb(1)).toBe(EQ_BOOST_DB);
  });

  it('es creciente en todo el recorrido', () => {
    let previousItem = -Infinity;
    for (let v = 0; v <= 1.0001; v += 0.05) {
      const db = eqValueToDb(v);
      expect(db).toBeGreaterThanOrEqual(previousItem);
      previousItem = db;
    }
  });

  it('un cuarto de recorrido es la mitad del corte (-20 dB)', () => {
    expect(eqValueToDb(0.25)).toBeCloseTo(-20);
  });

  it('limita los valores fuera de rango', () => {
    expect(eqValueToDb(-3)).toBe(EQ_KILL_DB);
    expect(eqValueToDb(7)).toBe(EQ_BOOST_DB);
  });
});

describe('dbToEqValue', () => {
  it('es la inversa de eqValueToDb', () => {
    for (const v of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      expect(dbToEqValue(eqValueToDb(v))).toBeCloseTo(v, 6);
    }
  });

  it('limita los decibelios fuera de rango', () => {
    expect(dbToEqValue(-100)).toBe(0);
    expect(dbToEqValue(30)).toBe(1);
  });
});
