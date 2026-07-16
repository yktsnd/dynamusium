export type Derivatives = (t: number, y: Float64Array, out: Float64Array) => void;

/**
 * Scratch buffers for allocation-free RK4 stepping.
 */
export function createRk4Scratch(size: number) {
  return {
    k1: new Float64Array(size),
    k2: new Float64Array(size),
    k3: new Float64Array(size),
    k4: new Float64Array(size),
    tmp: new Float64Array(size),
  };
}

export type Rk4Scratch = ReturnType<typeof createRk4Scratch>;

/**
 * One classical fixed-step Runge–Kutta 4 step. Advances `y` in place from t
 * to t + dt.
 */
export function rk4Step(
  f: Derivatives,
  t: number,
  y: Float64Array,
  dt: number,
  s: Rk4Scratch,
): void {
  const n = y.length;
  const { k1, k2, k3, k4, tmp } = s;

  f(t, y, k1);
  for (let i = 0; i < n; i++) tmp[i] = y[i] + 0.5 * dt * k1[i];
  f(t + 0.5 * dt, tmp, k2);
  for (let i = 0; i < n; i++) tmp[i] = y[i] + 0.5 * dt * k2[i];
  f(t + 0.5 * dt, tmp, k3);
  for (let i = 0; i < n; i++) tmp[i] = y[i] + dt * k3[i];
  f(t + dt, tmp, k4);
  for (let i = 0; i < n; i++) y[i] += (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
}
