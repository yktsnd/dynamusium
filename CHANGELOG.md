# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Corrected five source links that did not open the work they named. Three
  DOIs resolved to entirely unrelated papers (Double Pendulum, Standard Map,
  Brusselator), one link was a dead NTRS record (Hohmann Transfer), and one
  pointed at Lemaître's 1927 French original while displaying the title of
  the 1931 English translation (Friedmann–Lemaître). Lotka–Volterra named a
  different Volterra paper than the one it linked to.
- Held total energy in the two conservative works that were visibly not
  conserving it. Integrated at one RK4 step per displayed frame, the Double
  Pendulum's energy wandered by up to 53% and the three-body system's grew
  by up to 165% over a run — motion a visitor would read as physics but that
  came from the integrator. Both now substep, holding the drift below 1e-4
  relative across their whole parameter range.
- Corrected the Lotka–Volterra equation card, which displayed coefficients
  0.5 and 0.8 while the kernel integrated 0.45 and 0.9.
- Corrected the Friedmann–Lemaître equation and slider, which labelled the
  matter term with Ωᵣ, the standard symbol for radiation density.
- Corrected two bylines that asserted more than the museum could support:
  the Double Pendulum's uncorroborated "1746 · Daniel Bernoulli", and
  FitzHugh–Nagumo's single 1961 date, which implied Nagumo co-authored
  FitzHugh's solo paper rather than publishing separately in 1962.
- Credited Mary Tsingou on the FPUT Chain, whose citation previously named
  only the report number.

### Added

- `npm run cite:verify`: resolves every catalog DOI through CrossRef and
  compares the publisher's registered title against the displayed one,
  maintaining a verification ledger that offline tests assert against, so a
  citation cannot be changed without being re-verified.
- Conservation tests that measure invariants from real kernel output across
  each work's full parameter range.
- A unit on every parameter of all thirty works, rendered as a quiet suffix
  beside the value. Previously no slider declared one, so a visitor could not
  tell whether "Gravity g = 9.81" meant m/s², a nondimensionalized quantity,
  or an arbitrary number. Nondimensionalized and uncalibrated kernels say so
  (`dimensionless`, `model unit`) rather than borrowing an SI unit their
  equations do not support, and a test requires one on every new parameter.

## [1.0.0] - 2026-07-28

The museum relaunch. This release supersedes the earlier single-instrument
0.1.0 release: the project is reintroduced end to end as DynaMusium, a
permanent collection rather than a single demonstration model.

### Added

- Reintroduced the project as **DynaMusium — Museum of Dynamic Systems**, a
  permanent collection of thirty sourced interactive works across five
  scientific galleries.
- Added Observe, Study, and Exhibit modes, synchronized accessible data
  tables, deterministic ODE/discrete/field/analytic runtimes, and shareable
  work URLs.
- Established the Dynamical Portrait contract that every work follows:
  a numerical kernel produces a typed result with provenance, analyzers
  derive evidence-backed scientific objects from that result, immutable
  reviewed semantic visual mappings bind those objects to marks and
  channels, and composition arranges the mapped layers without altering
  their scientific meaning.
- Added the version-2 work manifest schema and the `work:new` /
  `work:validate` authoring commands, giving human and agent contributors a
  scaffold-to-validation path for new works.
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

[Unreleased]: https://github.com/yktsnd/dynamusium/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/yktsnd/dynamusium/releases/tag/v1.0.0
[0.1.0]: https://github.com/yktsnd/dynamusium/releases/tag/v0.1.0
