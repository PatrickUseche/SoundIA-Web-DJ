/** Formatea segundos como m:ss (por ejemplo 125.4 -> "2:05"); los valores invalidos o negativos dan "0:00". */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

/** BPM con un decimal, por ejemplo 127.98 -> "128.0". */
export function formatBpm(bpm: number): string {
  return Number.isFinite(bpm) ? bpm.toFixed(1) : '--';
}

/** Cambio de velocidad como porcentaje con signo: 1.035 -> "+3.5%", 0.95 -> "-5.0%", 1 -> "0.0%". */
export function formatPitch(ratio: number): string {
  const percent = (ratio - 1) * 100;
  const text = Math.abs(percent) < 0.05 ? '0.0' : percent.toFixed(1);
  return percent >= 0.05 ? `+${text}%` : `${text}%`;
}
