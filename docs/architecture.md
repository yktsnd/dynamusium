# DynaMusium architecture

## Product layers

1. **Museum Shell** owns navigation, collection filtering, URL state, Observe/Study/Exhibit
   modes, responsive layout, and accessibility.
2. **Work manifests** own curatorial metadata, bounded parameters, presets, provenance, runtime,
   and renderer selection.
3. **Simulation kernels** compute immutable deterministic results. They do not import React or
   read the DOM.
4. **Presentation** consumes only normalized result series, trajectory points, fields, and
   diagnostics. It never reimplements equations.

The older reaction-network model, solver, Zustand store, and SVG network remain tested modules.
They are preserved as a specialized scientific instrument and compatibility reference while the
museum runtime generalizes beyond first-order kinetics.

## Registration and discovery

The permanent collection is defined in `src/museum/catalog.ts`. External additions are one JSON
file under `src/works/community/`, validated against `src/works/work.schema.json` and discovered
with `import.meta.glob`. This keeps a contribution atomic and avoids a merge-conflict-prone
central registry.

`WorkManifest` is the public build-time interface. A work is addressable by a unique kebab-case
slug and deep-linked with query parameters:

```text
?work=lorenz-atmosphere&mode=study&preset=threshold
```

Query routing is intentional: direct reloads work on GitHub Pages without a server fallback.

## Numerical contract

`simulateWork()` accepts a manifest and parameter overrides and returns a `WorkResult` containing
times, labelled series, trajectory points, an optional bounded spatial field, and diagnostics.
All shipped canonical works are executed in the unit suite. Tests enforce finite output and
deterministic replay.

The original typed `SimulationResult` contract still governs the reaction-network solver:
negative excursions beyond tolerance, non-finite values, and decreasing cumulative output abort
instead of being clamped away.

## Rendering and accessibility

The artwork, traces, readouts, and Study table consume the same `WorkResult`. The current-time row
is therefore not a second computation. Decorative stars, orbital hairlines, imagery, and room
lighting are `aria-hidden` and never represent model state.

Observe removes explanatory density, Study exposes equation/source/data, and Exhibit recedes
chrome while continuing the same computed playback. Reduced-motion removes optional transitions;
sliders, traces, values, and keyboard access remain.

## Static deployment

Vite builds a static application. `DYNAMUSIUM_BASE` is set from the current GitHub repository name
in the Pages workflow, so the same commit works before and after the `kinetiflux` to `dynamusium`
repository rename. No backend or persistent browser storage is required.
