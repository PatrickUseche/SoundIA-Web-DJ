import { AutomationPoint } from '../models/autodj';

const CAMPOS: (keyof AutomationPoint)[] = [
  'gainA', 'gainB', 'lowA', 'lowB', 'midA', 'midB', 'highA', 'highB',
];

/**
 * Valor de la automatizacion en una posicion cualquiera de la transicion (0 a 1), interpolando
 * linealmente entre los dos puntos mas cercanos. Antes del primero o despues del ultimo se devuelven
 * los extremos; sin puntos, null.
 *
 * Interpolar mantiene los invariantes de las curvas: los graves de las dos pistas siguen sumando 1 (nunca
 * suenan los dos a la vez) y la ganancia por potencia constante sigue siendo suave.
 */
export function interpolateAutomation(points: AutomationPoint[], position: number): AutomationPoint | null {
  if (points.length === 0) {
    return null;
  }
  const p = Math.min(1, Math.max(0, position));
  if (p <= points[0].position) {
    return points[0];
  }
  const last = points[points.length - 1];
  if (p >= last.position) {
    return last;
  }

  const nextIndex = points.findIndex((point) => point.position >= p);
  const before = points[nextIndex - 1];
  const after = points[nextIndex];
  const span = after.position - before.position;
  const t = span === 0 ? 0 : (p - before.position) / span;

  const result = { ...before, position: p };
  for (const campo of CAMPOS) {
    result[campo] = before[campo] + (after[campo] - before[campo]) * t;
  }
  return result;
}

/**
 * Convierte un valor de la automatizacion (1 = banda abierta, 0 = cortada) en la posicion de la perilla del
 * EQ del deck (0 = cortada, 0.5 = plana): una banda abierta es una perilla en el centro, no al maximo.
 */
export function automationToKnob(value: number): number {
  return Math.min(1, Math.max(0, value)) * 0.5;
}
