# Numerical method

The solver lives in `src/solver/` and has no React or DOM dependency. This
document describes what it does and, explicitly, what it does not claim to
do: these are implementation choices suited to the demonstration model
KinetiFlux ships, not universally correct choices for every dynamical
system.

## Method: classical fixed-step RK4

`rk4Step` (`src/solver/rk4.ts`) is the textbook fixed-step, explicit
fourth-order Runge–Kutta method: four derivative evaluations (`k1..k4`) per
step, combined as `y += (dt/6)(k1 + 2k2 + 2k3 + k4)`. It operates on
pre-allocated `Float64Array` scratch buffers (`createRk4Scratch`) so a full
integration run does no per-step heap allocation.

There is no adaptive step-size control and no embedded error estimate (e.g.
no RK45/Dormand–Prince pair). The step size is fixed for the entire run.

## Internal step size

The step `dt` comes from the model's `config: SimulationConfig`
(`src/model/schema.ts`), not from any UI control. For the shipped
demonstration model (`src/model/demonstration-model.ts`) and the example
model (`examples/damped-cascade.ts`), `dt = 0.02 s`. `integrate()`
(`src/solver/integrate.ts`) runs `Math.round(duration / dt)` steps and stores
**every** step as a frame — there is no internal sub-stepping that goes
unrecorded, and no downsampling of the stored trajectory relative to the
integration.

## Interpolation between frames

Because frames are stored at every `dt`, any time within `[0, duration]` that
falls between two stored frames is produced by linear interpolation:
`frameAt(trajectory, t)` (`src/solver/trajectory.ts`) locates the bracketing
frame indices and linearly interpolates quantities, reservoir, and all three
rate channels (`forward`, `reverse`, `net`) independently. This is a display
convenience for scrubbing/hovering at sub-`dt` resolution — the underlying
numerical solution is only actually computed at the `dt` grid points.

## Tolerances (`src/solver/numerical-tolerance.ts`)

Three named constants are the single source of truth for numerical slack in
this codebase; tests and runtime clamping both use them instead of scattering
magic epsilons:

| Constant                          | Value   | Meaning                                                                                                          |
| --------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `NONNEGATIVE_TOLERANCE`           | `1e-9`  | How far below zero a quantity can drift before it's treated as a real (counted) violation rather than roundoff.  |
| `MASS_BALANCE_RELATIVE_TOLERANCE` | `1e-8`  | Allowed relative drift in closed-system mass-balance regression checks.                                          |
| `MONOTONICITY_TOLERANCE`          | `1e-12` | Allowed backward step in the cumulative reservoir series before it would count as a real monotonicity violation. |

## Nonnegative handling

After every RK4 step, `integrate()` scans all state variables (species
quantities and the reservoir, which share one state vector — see below).
Any value `< 0` is clamped to `0`. If the excursion was more negative than
`-NONNEGATIVE_TOLERANCE`, it is counted in `clampViolations` (returned
alongside the trajectory as `Trajectory & { clampViolations: number }`).
Excursions within tolerance are treated as ordinary floating-point roundoff
and clamped silently, uncounted. A nonzero `clampViolations` after a run is a
signal that the fixed step size may be too large for the current parameter
values (see Limitations below), not merely numerical noise.

## Reservoir as an extra state variable

The cumulative-output reservoir is not computed by post-processing an output
rate — it is integrated as an additional state variable. `compileSystem`
(`src/model/equations.ts`) builds a state vector of length `species.length +
1`, with the reservoir at the last index (`reservoirIndex`); `outflow`
processes add their rate to that index's derivative the same way `conversion`
processes add to a species' derivative. This keeps the reservoir on the same
integration footing (same step, same solver, same clamping) as every species.

On top of that, `record()` in `integrate()` applies an explicit
`Math.max(reservoir[frame - 1], y[reservoirIndex])` guard when storing each
frame, so that even if a step or interpolation would otherwise produce a
minute backward tick in the stored series, the recorded cumulative-output
curve is monotone by construction.

## Determinism

- No randomness appears anywhere in `src/model/` or `src/solver/`.
- Frame times are recomputed from the step index (`t = step * dt`) rather
  than accumulated by repeated addition, avoiding floating-point drift over
  long runs.
- Identical `(model, params, profile, initialOverrides)` inputs always
  produce bitwise-identical output arrays — this is what lets the UI treat
  playback speed and scrubbing as pure view state (see
  [architecture.md](./architecture.md)).

## Known limitations

These are properties of the current solver as applied to the demonstration
model, stated plainly rather than left implicit:

- **Fixed step is not suited to stiff systems.** There is no adaptive
  step-size control, so a parameter combination that makes the system stiff
  (widely separated rate constants) can produce visible clamp violations or
  an inaccurate solution without any runtime error — nothing currently
  surfaces `clampViolations` in the UI.
- **First-order mass-action kinetics only.** The rate laws `compileSystem`
  can build are limited to what `ProcessDef` expresses (see
  [model-contract.md](./model-contract.md)); this solver has no support for
  second-order, saturating, or otherwise nonlinear rate expressions.
- **Clamping slightly perturbs strict conservation.** Clamping a small
  negative excursion to exactly zero is a real (if tiny, at
  `NONNEGATIVE_TOLERANCE` scale) departure from what unclamped continuous
  integration would have produced; closed-system mass balance is only
  guaranteed up to `MASS_BALANCE_RELATIVE_TOLERANCE`, not exactly.

None of this is a general endorsement of RK4-with-clamping as correct for
arbitrary kinetic systems — it is documentation of the specific, deliberate
tradeoff this project made for a demonstration model with well-behaved,
non-stiff parameter ranges.
