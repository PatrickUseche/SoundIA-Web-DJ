import { automationToKnob, interpolateAutomation } from './automation';
import { AutomationPoint } from '../models/autodj';

/** Puntos como los que genera el motor de IA: crossfader de potencia constante y bass swap a mitad. */
function curva(stepCount: number): AutomationPoint[] {
  return Array.from({ length: stepCount + 1 }, (_, i) => {
    const p = i / stepCount;
    const cambiado = p >= 0.5;
    return {
      position: p,
      gainA: Math.cos((p * Math.PI) / 2),
      gainB: Math.sin((p * Math.PI) / 2),
      lowA: cambiado ? 0 : 1,
      lowB: cambiado ? 1 : 0,
      midA: 1 - p,
      midB: p,
      highA: 1 - p,
      highB: p,
    };
  });
}

describe('interpolateAutomation', () => {
  it('sin puntos devuelve null', () => {
    expect(interpolateAutomation([], 0.5)).toBeNull();
  });

  it('antes del primer punto devuelve el primero', () => {
    const puntos = curva(4);

    expect(interpolateAutomation(puntos, 0)).toEqual(puntos[0]);
    expect(interpolateAutomation(puntos, -3)).toEqual(puntos[0]);
  });

  it('despues del ultimo punto devuelve el ultimo', () => {
    const puntos = curva(4);

    expect(interpolateAutomation(puntos, 1)).toEqual(puntos[4]);
    expect(interpolateAutomation(puntos, 9)).toEqual(puntos[4]);
  });

  it('en la posicion exacta de un punto devuelve ese punto', () => {
    const puntos = curva(4);

    const dataPoint = interpolateAutomation(puntos, 0.25)!;

    expect(dataPoint.midB).toBeCloseTo(0.25);
    expect(dataPoint.gainA).toBeCloseTo(puntos[1].gainA);
  });

  it('entre dos puntos interpola linealmente', () => {
    const puntos: AutomationPoint[] = [
      { position: 0, gainA: 1, gainB: 0, lowA: 1, lowB: 0, midA: 1, midB: 0, highA: 1, highB: 0 },
      { position: 1, gainA: 0, gainB: 1, lowA: 0, lowB: 1, midA: 0, midB: 1, highA: 0, highB: 1 },
    ];

    const medio = interpolateAutomation(puntos, 0.25)!;

    expect(medio.position).toBe(0.25);
    expect(medio.gainA).toBeCloseTo(0.75);
    expect(medio.gainB).toBeCloseTo(0.25);
    expect(medio.midA).toBeCloseTo(0.75);
    expect(medio.highB).toBeCloseTo(0.25);
  });

  it('los graves de las dos pistas suman siempre 1 (nunca suenan a la vez) tambien al interpolar', () => {
    const puntos = curva(16);

    for (let p = 0; p <= 1.0001; p += 0.013) {
      const dataPoint = interpolateAutomation(puntos, p)!;
      expect(dataPoint.lowA + dataPoint.lowB).toBeCloseTo(1, 10);
    }
  });

  it('la ganancia entrante sube y la saliente baja a lo largo de toda la transicion', () => {
    const puntos = curva(16);
    let previousItem = interpolateAutomation(puntos, 0)!;

    for (let p = 0.02; p <= 1.0001; p += 0.02) {
      const currentItem = interpolateAutomation(puntos, p)!;
      expect(currentItem.gainB).toBeGreaterThanOrEqual(previousItem.gainB - 1e-9);
      expect(currentItem.gainA).toBeLessThanOrEqual(previousItem.gainA + 1e-9);
      previousItem = currentItem;
    }
  });

  it('no modifica los puntos originales', () => {
    const puntos = curva(4);
    const backup = JSON.stringify(puntos);

    interpolateAutomation(puntos, 0.3);

    expect(JSON.stringify(puntos)).toBe(backup);
  });

  it('con puntos en la misma posicion no divide por cero', () => {
    const base = { gainA: 1, gainB: 0, lowA: 1, lowB: 0, midA: 1, midB: 0, highA: 1, highB: 0 };
    const puntos: AutomationPoint[] = [
      { ...base, position: 0 },
      { ...base, position: 0.5 },
      { ...base, gainA: 0.2, position: 0.5 },
      { ...base, position: 1 },
    ];

    const dataPoint = interpolateAutomation(puntos, 0.5)!;

    expect(Number.isNaN(dataPoint.gainA)).toBe(false);
  });
});

describe('automationToKnob', () => {
  it('una banda abierta es una perilla plana (centro) y una cortada es el minimo', () => {
    expect(automationToKnob(1)).toBe(0.5);
    expect(automationToKnob(0)).toBe(0);
  });

  it('es proporcional entre los dos extremos', () => {
    expect(automationToKnob(0.5)).toBe(0.25);
  });

  it('limita los valores fuera de rango', () => {
    expect(automationToKnob(3)).toBe(0.5);
    expect(automationToKnob(-3)).toBe(0);
  });
});
