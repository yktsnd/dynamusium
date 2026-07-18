# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Reintroduced the project as **DynaMusium — Museum of Dynamic Systems** with
  thirty sourced interactive works across five scientific galleries.
- Added Observe, Study, and Exhibit modes, synchronized accessible data tables,
  deterministic ODE/discrete/field/analytic runtimes, and shareable work URLs.
- Added a machine-readable work schema and `work:new` / `work:validate` authoring
  commands for human and agent contributors.
- Exhibition (kiosk) mode: a fullscreen presentation mode (toggle button,
  "e" key, or `?exhibit=1` URL param) that auto-advances through presets by
  calling the same preset-selection action a user click would, with a
  scene-transition fade and a prominent caption interstitial between
  presets, and that recedes its own chrome after a period of inactivity,
  restoring it on any input.

### Changed

- Redesigned the presentation layer around a "Quiet Instrument" identity:
  the network view and trace strips now sit directly on the field with no
  card chrome, in open-top instrument-column vessels and a matching
  reservoir basin, connected by permanent hairline "filament" channels with
  a translucent rate band layered on top only while active.
- Reworked the quantity and rate charts into chrome-free trace strips with a
  right-edge live readout column replacing the old below-chart readout row
  and per-chart legend.
- Replaced the in-card stage title with a museum-style caption (model name
  plus the active preset's tagline).
- Turned the time axis into the playback scrubber, sharing the trace
  strips' horizontal scale so the scrubber thumb and the charts' playback
  cursor always align.
- The "how to read" legend overlay now starts closed by default.

## [0.1.0] - 2026-07-16

### Added

- Initial application release: a demonstration flow-network model with an
  RK4 numerical solver.
- Animated network visualization of the model's state over time.
- Synchronized charts driven by the same simulation clock.
- Parameter presets and an interactive parameter inspector.
- Numerical safety: integration returns a typed `SimulationResult`; failures
  beyond tolerance (negative quantities, non-finite values, decreasing
  cumulative output) halt playback and surface an explicit error state with
  diagnostics instead of being clamped away.
- Project documentation and continuous integration setup.

[Unreleased]: https://github.com/yktsnd/dynamusium/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yktsnd/dynamusium/releases/tag/v0.1.0
