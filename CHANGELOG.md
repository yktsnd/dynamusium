# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/yktsnd/kinetiflux/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yktsnd/kinetiflux/releases/tag/v0.1.0
