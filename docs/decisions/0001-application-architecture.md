# ADR 0001: Application architecture

**Status:** accepted

**Scope:** preserved specialized reaction-network runtime (`src/model`, `src/solver`,
`src/state`, and its SVG / chart presentation). The museum-wide runtime is governed by
[ADR 0006](./0006-dynamical-portrait-runtime.md); this ADR is not a requirement that every museum
work use Zustand, precomputed RK4, or SVG.

## Context

KinetiFlux animates the solution of a deterministic ODE system and lets a
user scrub through it, change parameters, and switch presets, all while
keeping the network view and two charts in sync. Three foundational
decisions shape everything else in the codebase: how the simulation itself
is computed and consumed, how application state is stored, and how the
network/charts are drawn.

## Decision

**Precompute the whole trajectory; playback is an index into it.**
`integrate()` runs a complete fixed-step RK4 pass up front and returns an
immutable `Trajectory` (`src/solver/trajectory.ts`) — every frame from `t=0`
to `t=duration` computed and stored before any pixel is drawn. Playback
(`usePlaybackLoop`), scrubbing (`setTime`), and hovering
(`setHoverTime`) never step the ODE system live; they only pick a `time`
value and read `frameAt(trajectory, time)`. A parameter, profile, or preset
change triggers one fresh `integrate()` call and replaces `trajectory`
wholesale (see [architecture.md](../architecture.md)).

**Zustand for state**, not React Context or Redux. One store
(`src/state/simulation-store.ts`) owns the model, parameters, profile,
trajectory, and all interaction state, with plain selector functions
(`src/state/selectors.ts`) deriving read views.

**Plain SVG plus custom chart/network code**, not a charting library or a
canvas/WebGL renderer. The network (`src/visualization/network/`) and both
charts (`src/charts/`) are hand-written SVG components reading
`Trajectory`/`Frame` data directly.

## Consequences

- Scrubbing and hovering are cheap and instantaneous — they are array reads
  plus a linear interpolation (`frameAt`), never a re-simulation, so the UI
  stays responsive regardless of scrub speed.
- Playback speed changes are pure view changes: `advance()` only changes how
  fast `time` moves through an already-complete curve, never what the curve
  is (numerical invariant #6 in `AGENTS.md`).
- Memory cost scales with `duration / dt` (frame count) times the number of
  species and processes — for the shipped model (`60s / 0.02s = 3000`
  frames) this is small; a much longer or finer-grained model would need to
  reconsider whether every step must be stored (`SimulationConfig` currently
  has no cap other than the 500k-frame budget check in
  `validateModel`).
- A single store composing model + params + profile + trajectory means there
  is exactly one place a new trajectory can be produced, which is what makes
  the "one immutable trajectory, all views read the same object" guarantee
  possible to enforce by inspection rather than convention alone.
- SVG keeps the network's vessels and channels as real DOM nodes, so they can
  be `role="button"`/`tabIndex`/`aria-label`-bearing and keyboard-focusable
  directly, and keeps every visual attribute (fill, stroke, dash pattern)
  expressible as CSS/SVG attributes driven by the design tokens, rather than
  imperative canvas drawing calls that would have to reimplement
  accessibility and hit-testing by hand.
- The scene (three species, four processes, one reservoir, tens of
  particles) is small enough that SVG's DOM overhead is not a performance
  concern; this tradeoff would need revisiting for a much larger network.

## Alternatives considered

- **Live/streaming simulation** (step the ODE forward in a `requestAnimationFrame`
  loop, discarding history): rejected because it makes scrubbing backward
  either impossible or require re-simulating from `t=0` on every scrub,
  couples playback speed to numerical step size, and makes "chart values and
  displayed labels derive from the same simulation frame" (numerical
  invariant #7) harder to guarantee under variable frame timing.
- **React Context / Redux** for state: rejected as unnecessary ceremony for a
  single-store app with no need for Redux middleware or Context's
  provider-tree scoping; Zustand gives selector-based subscriptions with far
  less boilerplate.
- **A charting library or canvas/WebGL renderer**: rejected because the scene
  is small, the project wants precise control over the exact visual encodings
  described in [visual-language.md](../visual-language.md) (sqrt-scaled
  width, destination-color convention, dashed reverse lines), and SVG keeps
  the network natively accessible without reimplementing focus/hit-testing
  that canvas/WebGL would require.
