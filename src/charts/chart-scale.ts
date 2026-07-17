/** Nice tick generation for chart axes. */

function niceStep(rough: number): number {
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  const step = norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1;
  return step * mag;
}

export interface Scale {
  min: number;
  max: number;
  ticks: number[];
}

/** Expand [min, max] to nice bounds with ~`count` ticks. Always includes 0 when spanned. */
export function niceScale(min: number, max: number, count = 4): Scale {
  if (max === min) max = min + 1;
  const step = niceStep((max - min) / count);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.abs(v) < step / 1e6 ? 0 : v);
  return { min: lo, max: hi, ticks };
}
