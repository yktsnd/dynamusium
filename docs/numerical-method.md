# Numerical methods and scientific validation

DynaMusium does not prescribe one solver for every work. Reviewed museum kernels live in
`src/museum/runtimes/`; the specialized reaction-network solver remains in `src/solver/`. Neither
layer depends on React, the DOM, canvas, or SVG. A work declares its execution profile, numerical
provenance, required checks, and limitations. The renderer receives results only after those
boundaries have accepted them.

## Runtime-specific methods

The implementation uses the method that matches the declared mathematical object:

| Runtime family                       | Current method / representation                                              | Required evidence pattern                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Legacy collection ODE profiles       | Explicit fixed-step RK4 with per-stage dimension and finite checks           | M1 unless that work emits its declared convergence / reference checks        |
| Reviewed Lorenz profile              | Explicit fixed-step RK4 plus a separate half-step comparison                 | Short-window step halving and equilibrium / finite-recurrence qualifications |
| Fed reaction chain                   | Fixed-step RK4 of the declared forced compartment law                        | Positivity, mass balance, feed integral, monotone collection, step halving   |
| Kuramoto network                     | Fixed-step RK4 on twelve phase coordinates                                   | Phase-shift-aware step comparison, `0 <= r <= 1`, locking statistic          |
| α-FPUT chain                         | Velocity Verlet on the full position / momentum state                        | Exact Hamiltonian residual, recurrence qualification, refinement             |
| Gray–Scott                           | Periodic finite differences with an explicit stability-limited reaction step | Stability number, nonnegative concentrations, boundary and grid checks       |
| Cahn–Hilliard                        | Periodic centered finite differences and explicit conserved update           | Mean / mass residual, free-energy behavior, boundary and grid checks         |
| Ising                                | Seeded checkerboard Metropolis Markov sampler                                | Seed replay, spin domain, finite burn-in / sample qualifications             |
| Linear rotating shallow water        | Periodic centered spatial differences with RK4 under a declared CFL bound    | CFL, mass, energy, boundary, and grid checks                                 |
| Standing wave and periodic heat      | Closed-form modal families sampled on declared grids                         | PDE identity / grid residual, boundary, energy or mean / variance identities |
| Free Gaussian Schrödinger packet     | Closed-form wave-packet density on a declared display window                 | Normalization, truncation, identity, and sampling residuals                  |
| Budyko–Sellers                       | Reduced zonal energy-balance relaxation with no-flux meridional boundary     | Equilibrium, transport balance, boundary, and grid residuals                 |
| Analytic orbit / observation kernels | Declared closed-form or event construction                                   | Formula-specific identity, continuity, conservation, or reference value      |

This table describes implementation families, not universal recommendations. In particular,
fixed-step RK4 is not silently reused for stiff kinetics, Hamiltonian long-time structure,
Markov sampling, or arbitrary PDEs.

## Common valid / invalid policy

Before a museum result can be displayed, the runtime and execution boundary check:

- all declared parameters are finite and within their manifest bounds;
- runtime and kernel registration agree;
- times are finite, strictly increasing, and nonempty;
- every state, observable, projection sample, and field component is finite;
- state, observable, point, frame, and grid dimensions agree exactly;
- every hard runtime constraint passes.

There is no `NaN -> 0` fallback and no arbitrary global cap such as `+/-1e6`. Missing derivative
components are not filled with zero. A violation produces `WorkRunResult.status === 'invalid'`,
clears the current display, stops playback, and exposes a failure message. The previous successful
trajectory is not relabelled as the result of the new parameters.

Small roundoff correction remains allowed only where a specialized solver declares a physical
domain and named tolerance, such as the legacy nonnegative reaction quantities. It is counted in
diagnostics; values beyond tolerance fail.

## Validation matrix

Validation has two severities. A **hard** failure makes a run unusable. A **claim** failure keeps
otherwise valid raw data available but prevents the corresponding scientific promotion or lowers
the attained maturity.

| Check class                | Examples                                                                       | Effect                                                |
| -------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Shape and arithmetic       | finite output, dimension consistency, monotone sample times                    | Hard invalid result                                   |
| Dispatch and inputs        | parameter bounds, registered runtime / kernel, declared seed                   | Hard invalid result                                   |
| Integration convergence    | step halving, grid refinement, analytic residual                               | Required for a reviewed M2 claim when declared        |
| Physical constraints       | positivity, mass balance, energy residual, CFL, boundary residual              | Hard or claim severity chosen by the runtime contract |
| Local / regime evidence    | equilibrium residual, order-parameter bounds, recurrence threshold             | Qualifies the regime-specific primary claim           |
| Reference validation       | exact special case, published benchmark, reference trajectory or statistic     | Enables M3 only when declared and passing             |
| Stochastic reproducibility | algorithm version, seed, sample schedule, seeded replay                        | Required before stochastic output is treated as M1+   |
| Optional analysis          | EDMD holdout / conditioning, finite recurrence, box graph, H0 pairs, interface | Derived object omitted when evidence is insufficient  |

`deterministic-replay` means that every deterministic input (or stochastic seed and schedule) is
captured in run identity and `executeWork()` repeats the complete kernel call, requiring exact
equality of the exposed `WorkResult`. It is a same-implementation reproducibility check, not a
claim that different engines produce a mathematically exact infinite-precision trajectory.

Every validation listed by a portrait must appear in the completed check set. A missing declared
check is recorded as `not-run`, never silently treated as passing. `not-run` at hard severity
invalidates the run; `not-run` at claim severity prevents the corresponding maturity promotion.

## Advanced finite evidence methods

The generic browser foundation includes bounded numerical building blocks, but their result names
deliberately stop short of theorem-strength claims.

### Pseudo-arclength continuation

`continueEquilibriumBranch()` advances equilibria of a supplied finite-dimensional residual with a
predictor / Newton-corrector pseudo-arclength scheme. It records residual norms, state and
augmented-Jacobian condition estimates, accepted / rejected steps, finite-difference use, and
bounded stability-eigenvalue convergence. Browser limits cap the state dimension, point count,
Newton iterations, function evaluations, and eigen iterations.

A change in the parameter component of the branch tangent produces a **fold candidate** only.
Finite precision, a small residual, and a tangent reversal do not establish existence,
non-degeneracy, transversality, uniqueness, or a validated branch. A work that claims those
properties must supply a separately reviewed continuation / interval artifact.

### Finite EDMD

`analyzeFiniteEdmd()` fits a ridge-regularized finite-dimensional operator to an explicit,
sourced dictionary. Training samples precede a chronological holdout; the result records both
residuals, dictionary conditioning and scaling, the finite operator, sampling interval, modes, and
the principal complex-log branch used for optional continuous frequency / decay estimates.

The live portrait adapter selects two observables and an explicit identity dictionary, reserves
30% chronologically for holdout, and emits a scientific object only below its declared residual
tolerance. This is a finite EDMD approximation. It is not a true Koopman eigenfunction, a complete
or continuous Koopman spectrum, or a transfer-operator analysis.

### Finite-grid topology and transition enclosures

`analyzeZeroDimensionalPersistence()` uses lower-star union-find to compute H0 persistence exactly
for the supplied finite rectangular vertex filtration, connectivity, and boundary convention.
The Cahn–Hilliard live profile runs this capability on its final finite frame. Exactness here does
not extend to an unknown continuum field; H1 / H2, persistent cohomology, defect classes, and a
Morse–Smale complex are not computed.

`analyzeFiniteTransitionEnclosure()` accepts a supplied finite directed relation and reports
invariant, recurrent, exit, finite Morse-set, and order data. Sampled transitions remain observed
graph evidence. An interval outer approximation is caller-attested metadata rather than something
the generic analyzer constructs from the equation. The API accepts a Conley-index result only when
verified-coverage metadata, finite isolation, and an external verified index-pair certificate are
all supplied; scientific publication must still review that certificate and its source. Finite
enclosure evidence and the external certificate each require a source reference and lowercase
SHA-256 content hash, which the result repeats in provenance.

Validated bifurcation branches, Koopman / transfer spectra, continuum topology, Morse–Smale
structures, and computer-assisted proofs are outside the completion scope of these generic
browser routines. They enter DynaMusium only as per-work external reviewed artifacts.

## Scientific time and presentation time

`WorkResult.times` and `RunProvenance.interval` define scientific time. A `field-trajectory`
contains a complete computed frame for each listed sample time. Spatial rows and columns never
stand in for successive time samples.

`WorkResult.presentationDuration` is a separate wall-clock curation interval used to make a work
comfortable to watch. Stretching or shortening it does not change model time, step size,
frequency, decay rate, event order, flux integration, or any recorded observable. Scrubbing maps
to the actual scientific sample times.

## Representation-specific honesty

- `governing-law-execution` means the displayed state came from advancing the declared law.
- `closed-form-solution` means the displayed family satisfies a stated analytic law; sampling and
  display-window truncation are still reported.
- `reduced-model` means the reduction, assumptions, and effective time are part of the claim.
- `data-derived` requires identified input data and estimator provenance.
- `illustrative-surrogate` is never described as an equation solution and is capped at M0.

## Specialized reaction-network solver

The remainder of this document describes `src/solver/`, the preserved first-order
reaction-network instrument. These choices are correct only for its reviewed parameter ranges and
must not be generalized to every dynamical system.

### Method: classical fixed-step RK4

`rk4Step` (`src/solver/rk4.ts`) is the textbook fixed-step, explicit
fourth-order Runge–Kutta method: four derivative evaluations (`k1..k4`) per
step, combined as `y += (dt/6)(k1 + 2k2 + 2k3 + k4)`. It operates on
pre-allocated `Float64Array` scratch buffers (`createRk4Scratch`) so a full
integration run does no per-step heap allocation.

There is no adaptive step-size control and no embedded error estimate (e.g.
no RK45/Dormand–Prince pair). The step size is fixed for the entire run.

### Internal step size

The step `dt` comes from the model's `config: SimulationConfig`
(`src/model/schema.ts`), not from any UI control. For the shipped
demonstration model (`src/model/demonstration-model.ts`) and the example
model (`examples/damped-cascade.ts`), `dt = 0.02 s`. `integrate()`
(`src/solver/integrate.ts`) runs `Math.round(duration / dt)` steps and stores
**every** step as a frame — there is no internal sub-stepping that goes
unrecorded, and no downsampling of the stored trajectory relative to the
integration.

### Interpolation between frames

Because frames are stored at every `dt`, any time within `[0, duration]` that
falls between two stored frames is produced by linear interpolation:
`frameAt(trajectory, t)` (`src/solver/trajectory.ts`) locates the bracketing
frame indices and linearly interpolates quantities, reservoir, and all three
rate channels (`forward`, `reverse`, `net`) independently. This is a display
convenience for scrubbing/hovering at sub-`dt` resolution — the underlying
numerical solution is only actually computed at the `dt` grid points.

### Tolerances (`src/solver/numerical-tolerance.ts`)

Three named constants are the single source of truth for numerical slack in
this codebase; tests and runtime clamping both use them instead of scattering
magic epsilons:

| Constant                          | Value   | Meaning                                                                                                          |
| --------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `NONNEGATIVE_TOLERANCE`           | `1e-9`  | How far below zero a quantity can drift before it's treated as a real (counted) violation rather than roundoff.  |
| `MASS_BALANCE_RELATIVE_TOLERANCE` | `1e-8`  | Allowed relative drift in closed-system mass-balance regression checks.                                          |
| `MONOTONICITY_TOLERANCE`          | `1e-12` | Allowed backward step in the cumulative reservoir series before it would count as a real monotonicity violation. |

### Numerical safety: small corrections vs. abort

`integrate()` (`src/solver/integrate.ts`) does not return a bare `Trajectory`.
It returns a `SimulationResult` (`src/solver/simulation-result.ts`) — a typed
union of a `valid` result (`{ trajectory, diagnostics }`) and an `invalid`
result (`{ error, diagnostics }`) — so a numerically unusable run can never be
mistaken for a real trajectory (see [model-contract.md](./model-contract.md)
for the full type).

After every RK4 step, `integrate()` scans all state variables (species
quantities and the reservoir, which share one state vector — see below):

- A **non-finite** value (`NaN`/`Infinity`) always aborts integration
  immediately with a `non-finite` `NumericalError`.
- A value `< 0` but no more negative than `-NONNEGATIVE_TOLERANCE` is ordinary
  floating-point roundoff: it is corrected to `0` and counted in
  `diagnostics.smallClampCount`.
- A value more negative than `-NONNEGATIVE_TOLERANCE` is a genuine failure: it
  aborts integration with a `negative-quantity` `NumericalError`.

Aborting means exactly that: `integrate()` returns immediately with `status:
'invalid'`, carrying the `NumericalError` (`kind`, `message`, `time`, `step`,
`stateIndex`, `stateId`, `value`, `tolerance`) and the `diagnostics`
accumulated up to the failing step. No trajectory is produced and none of the
steps after the failure are computed — an invalid run is never silently
clamped into something that looks like a valid one.

On success, `integrate()` returns `status: 'valid'` with the completed
`trajectory` and the final `diagnostics` (`smallClampCount`,
`reservoirCorrectionCount`, `stepsCompleted`). A nonzero `smallClampCount` is
a signal that the fixed step size may be pushing the current parameter values
toward the edge of what's well-behaved (see Limitations below), even though
the run still succeeded.

### Reservoir as an extra state variable

The cumulative-output reservoir is not computed by post-processing an output
rate — it is integrated as an additional state variable. `compileSystem`
(`src/model/equations.ts`) builds a state vector of length `species.length +
1`, with the reservoir at the last index (`reservoirIndex`); `outflow`
processes add their rate to that index's derivative the same way `conversion`
processes add to a species' derivative. This keeps the reservoir on the same
integration footing (same step, same solver, same clamping) as every species.

The reservoir is subject to the same small-correction-vs-abort logic
described above, applied to its own step-to-step change rather than its
absolute sign: a decrease from the previous step of no more than
`NONNEGATIVE_TOLERANCE` is floating-point noise — the value is corrected back
to the previous frame's reservoir value and counted in
`diagnostics.reservoirCorrectionCount`. A larger decrease aborts integration
with a `reservoir-decrease` `NumericalError`. There is no unconditional
`Math.max` guard forcing monotonicity on every frame — only micro-decreases
within tolerance are corrected; a real backward tick is treated as the
numerical failure it is, not papered over.

### Determinism

- No randomness appears anywhere in `src/model/` or `src/solver/`.
- Frame times are recomputed from the step index (`t = step * dt`) rather
  than accumulated by repeated addition, avoiding floating-point drift over
  long runs.
- Identical `(model, params, profile, initialOverrides)` inputs always
  produce bitwise-identical output arrays — this is what lets the UI treat
  playback speed and scrubbing as pure view state (see
  [architecture.md](./architecture.md)).

### Known limitations

These are properties of the current solver as applied to the demonstration
model, stated plainly rather than left implicit:

- **Fixed step is not suited to stiff systems.** There is no adaptive
  step-size control, so a parameter combination that makes the system stiff
  (e.g. rate constants far beyond the stable region for the fixed `dt`) is
  not clamped or masked — it surfaces as an `invalid` `SimulationResult` (see
  above), and the store halts playback and shows the failure rather than
  displaying an inaccurate solution.
- **First-order mass-action kinetics only.** The rate laws `compileSystem`
  can build are limited to what `ProcessDef` expresses (see
  [model-contract.md](./model-contract.md)); this solver has no support for
  second-order, saturating, or otherwise nonlinear rate expressions.
- **Small-tolerance correction still perturbs strict conservation.**
  Correcting a within-tolerance negative excursion to exactly zero is a real
  (if tiny, at `NONNEGATIVE_TOLERANCE` scale) departure from what unclamped
  continuous integration would have produced; closed-system mass balance is
  only guaranteed up to `MASS_BALANCE_RELATIVE_TOLERANCE`, not exactly. Larger
  excursions are not corrected at all — they abort the run instead (see
  above).

None of this is a general endorsement of RK4-with-tolerance-correction as
correct for arbitrary kinetic systems — it is documentation of the specific,
deliberate tradeoff this project made for a demonstration model with
well-behaved, non-stiff parameter ranges.
