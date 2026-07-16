# Model contract

The typed contract between model definitions, the solver, and the visual
layers. Defined in `src/model/schema.ts` and `src/solver/trajectory.ts`. No
UI component may special-case a particular model — everything renders from
these types.

## Units and conventions

- Quantities are amounts in the model's `quantityUnit` (e.g. `"mol"`) and are
  never negative.
- Time is in the model's `timeUnit` (e.g. `"s"`).
- Rates are `quantity / time`. For every process, `forward` and `reverse` are
  both `>= 0`; `net = forward - reverse` is signed, and positive means flow
  from the process's `from` side to its `to` side.
- Layout coordinates (`LayoutPoint`) are abstract units in a 100 x 100 design
  space; the network renderer (`src/visualization/network/geometry.ts`) scales
  them into the SVG viewBox.

## Core types (`src/model/schema.ts`)

### `SpeciesDef`

One state variable rendered as a vessel.

| Field             | Meaning                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `id`              | Stable identifier, referenced by processes.                                                                                              |
| `label`           | Full display name.                                                                                                                       |
| `symbol`          | Short symbol shown inside the vessel (e.g. `"A"`).                                                                                       |
| `description`     | One-line explanation.                                                                                                                    |
| `initial`         | Quantity at `t = 0`.                                                                                                                     |
| `displayCapacity` | Display maximum used to scale the vessel fill — **not** a hard physical cap; quantities can exceed it and the fill simply clips at 100%. |
| `colorVar`        | CSS custom property carrying the species' color (e.g. `"--species-a"`).                                                                  |
| `layout`          | `LayoutPoint` position in the 100x100 design space.                                                                                      |

### `ParameterDef`

A user-adjustable rate constant. `id`, `label`, `unit`, `default`, `min`,
`max`, `step`. The inspector renders one control per `ParameterDef`; values
outside `[min, max]` are clamped (`clampParameterValue`), never allowed to
reach the solver.

### `InputProfile`

A time-dependent external inflow, evaluated by `evaluateProfile`
(`src/model/input-profiles.ts`). Always evaluates to `>= 0`.

| Kind       | Fields                         | Rate at time `t`                                                     |
| ---------- | ------------------------------ | -------------------------------------------------------------------- |
| `none`     | —                              | `0`                                                                  |
| `constant` | `rate`                         | `max(0, rate)`                                                       |
| `pulse`    | `amplitude`, `center`, `width` | Gaussian: `max(0, amplitude) * exp(-0.5 * ((t - center) / width)^2)` |
| `sine`     | `base`, `amplitude`, `period`  | `max(0, base + amplitude * sin(2π t / period))`                      |

`profileFields()` returns the editable-field metadata (label, unit, min, max,
step) the inspector uses to build controls per kind, and
`PROFILE_KIND_LABELS` names each kind for the profile-kind switcher.

### `ProcessDef` and rate laws

All processes are **first-order (mass-action)** in this version — this is a
structural property of the current model contract, not just of the shipped
demonstration model.

| Kind         | Fields                                        | Rate law                                                                                                                                                                                |
| ------------ | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inflow`     | `to`                                          | `rate(t) = evaluateProfile(profile, t)`, flows from outside the system into `to`.                                                                                                       |
| `conversion` | `from`, `to`, `forwardParam`, `reverseParam?` | `forward = k_f * quantity(from)`; `reverse = k_r * quantity(to)` if `reverseParam` is set, else `reverse = 0` (irreversible). `net = forward - reverse`, positive meaning `from -> to`. |
| `outflow`    | `from`, `rateParam`                           | `rate = k * quantity(from)`, flows from `from` into the reservoir.                                                                                                                      |

#### Reversible-rate representation

Reversibility is encoded by whether a `conversion` process sets
`reverseParam`. There is no separate "reversible" flag — `proc.reverseParam
!== undefined` is the single source of truth, used by both the solver
(`src/model/equations.ts`) and the network geometry (`ChannelGeom.reversible`
in `src/visualization/network/geometry.ts`) to decide whether a channel gets
one lane or two.

### `ReservoirDef`

The single collected-output basin every model has. `label`, `description`,
`colorVar`, `displayCapacity` (fill scaling, same convention as species),
`layout`.

### `SimulationConfig`

`duration` (total simulated time span) and `dt` (fixed internal RK4 step),
both in `timeUnit`. Every RK4 step is stored as a frame — there is no
sub-sampling.

### `ModelDefinition`

The top-level contract object: `id`, `name`, `description`, `timeUnit`,
`quantityUnit`, `species: SpeciesDef[]`, `processes: ProcessDef[]`,
`parameters: ParameterDef[]`, `reservoir: ReservoirDef`,
`config: SimulationConfig`.

### `ParameterValues`

`Record<ParameterId, number>` — the current value of every parameter,
produced by `defaultParameterValues(model)` and overridden per-preset or by
the inspector.

### `ProcessRates`

One process's rate decomposition at a moment in time: `{ forward, reverse,
net }`, per the sign convention above.

### `Frame`

The interpolated state of the whole system at one time point
(`src/solver/trajectory.ts`, `frameAt`): `time`, `quantities: number[]`
(species order matches `model.species`), `reservoir: number` (nondecreasing),
`rates: ProcessRates[]` (process order matches `model.processes`).

## `Trajectory` (`src/solver/trajectory.ts`)

The complete, immutable result of one integration run:

```ts
interface Trajectory {
  duration: number;
  dt: number;
  times: Float64Array; // length N, uniform spacing `dt`
  quantities: Float64Array[]; // per species (model order), length N each
  reservoir: Float64Array; // length N, nondecreasing
  rates: { forward: Float64Array; reverse: Float64Array; net: Float64Array }[]; // per process
}
```

- Uniform time spacing: `times[i] = i * dt`, recomputed from the step index
  rather than accumulated, so there is no floating-point drift.
- Every series is a `Float64Array`, one per species / process, in model
  order.
- `reservoir` is guarded to be nondecreasing frame-to-frame
  (`Math.max(reservoir[frame - 1], y[reservoirIndex])`) so interpolation or
  rounding can never make cumulative output dip.
- `frameAt(trajectory, t)` linearly interpolates all series to produce a
  `Frame` at an arbitrary `t` (clamped to `[0, duration]`).
- `seriesMax(series)` returns the maximum value across one or more series,
  used to scale chart axes and channel widths.

`integrate()` (`src/solver/integrate.ts`) returns `Trajectory &
{ clampViolations: number }` — the extra field is solver bookkeeping (see
[numerical-method.md](./numerical-method.md)), not part of the rendering
contract.

## Extension points

- **A new model**: write a new `ModelDefinition` — see
  `examples/damped-cascade.ts` for a complete second model (a three-stage
  cascade with a reversible holding pair) proving the contract is
  model-agnostic. Nothing in `src/` references that file; nothing in `src/`
  may reference a specific model by id or species name.
- **A new profile kind**: extend the `InputProfile` union in `schema.ts`, add
  its evaluation in `evaluateProfile`, its fields in `profileFields`, and its
  label in `PROFILE_KIND_LABELS`. `setProfileKind`'s default-value map in
  `simulation-store.ts` also needs an entry.
- **What requires code changes, not just a new `ModelDefinition`**:
  - A new rate law (anything beyond first-order mass action, e.g. a rate
    depending on more than one species, or a saturating/nonlinear term)
    requires extending `ProcessDef` and the corresponding term/rate-function
    construction in `src/model/equations.ts`.
  - Non-first-order kinetics generally, for the same reason — `compileSystem`
    currently only builds `k * quantity` and `k_f * q_from - k_r * q_to`
    terms.
  - Branching or non-linear layouts (a species with more than one inbound and
    one outbound lane sharing a row, cycles, junctions) require extending
    `computeGeometry` in `src/visualization/network/geometry.ts`, which
    currently lays out a single left-to-right chain plus one reservoir.
