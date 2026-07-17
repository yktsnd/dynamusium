/** Format a quantity/rate for display: stable width, no exponent noise. */
export function formatAmount(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—';
  const v = Math.abs(value) < 10 ** -digits / 2 ? 0 : value;
  return v.toFixed(digits);
}

/** Format seconds of simulated time, e.g. "12.4 s". */
export function formatTime(t: number, unit = 's'): string {
  return `${t.toFixed(1)} ${unit}`;
}

/** Format a signed rate with an explicit sign, e.g. "+0.32". */
export function formatSigned(value: number, digits = 2): string {
  const s = formatAmount(value, digits);
  return value > 0 && !s.startsWith('+') ? `+${s}` : s;
}
