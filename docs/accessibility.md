# Accessibility

Accessibility is part of the scientific contract: a visitor must be able to identify the work,
operate its reviewed controls, inspect numerical evidence, and recognize failure without relying
on color, motion, or pointer hover.

## Current museum shell

### Keyboard and control semantics

Entrance links, gallery filters, work cards, viewing modes, presets, playback, and reset actions
are native `<button>` elements. Gallery, mode, and preset groups carry explicit group labels;
selected states use `aria-pressed`. The timeline and every model parameter use native range inputs
with labels, so arrow keys, Page Up / Down, Home, and End work without custom keyboard behavior.

Observe, Study, and Exhibit switch presentation of one current run rather than creating separate
scientific states. Study includes a real HTML table of sampled observables and marks the current
row with `aria-current`.

### Artwork alternatives

Scientific SVG artworks use `role="img"` and a work-specific accessible name. The spatial-field
canvas has an accessible component description; its synchronized numerical observables and
evidence remain available in Study. Semantic-layer failure is a `role="alert"` rather than an
empty or decorative substitute.

The ambient museum layer is `aria-hidden="true"`. It carries no state, validity, direction,
uncertainty, or scientific value, so hiding it loses no information.

### Invalid and loading results

Starting a new calculation removes the previous display and marks the work view `aria-busy` while
loading. An invalid run is announced through a live `role="alert"`, explains that the current
parameters did not produce a valid result, and offers a native button to restore the canonical
preset. Playback and charts are not left attached to a stale trajectory.

Study reports hard and claim-level checks with text (`passed`, `failed`, or `not-run`), execution
provenance, maturity, and limitations. Status never depends on green / red styling alone.

### Reduced motion

The museum shell reads the shared `useReducedMotion` preference. When active, automatic playback
stops and the play control explicitly reads “Static view”; the scientific timeline remains
scrubbable. Quantity / flux particles are removed while numeric flux, width, and direction arrow
remain. Phase, modal-energy, trajectory, and field artworks keep their reviewed static state. The
same numerical payload and semantic mappings remain available in Study.

### Redundant scientific encodings

| Meaning              | Visual carrier                        | Non-color / non-motion carrier                                    |
| -------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| Quantity             | Luminous fill                         | Vessel label and numeric amount                                   |
| Directional flux     | Width, arrow, optional particles      | Direction arrow, width, and numeric flux                          |
| Oscillator coherence | Order-vector geometry and center area | `R` numeric label and oscillator indices                          |
| Modal energy         | Column height / area                  | Mode label, numeric energy, Hamiltonian residual                  |
| Field value          | Sequential or diverging raster        | Component identity, declared domain, traces, and Study values     |
| Validation status    | Optional status styling               | Status word, metric, tolerance, message, maturity, and limit text |
| Scale overflow       | Edge / overflow treatment             | “OUTSIDE SCALE” or coordinate count text                          |

## Preserved reaction-network module

The specialized reaction-network instrument remains in the repository with its own controls,
charts, overlays, and accessibility tests. The following details document that module and its
quantity / directional-flux grammar.

### Keyboard operability

Every interactive control is a native element or carries the ARIA/keyboard
behavior needed to act like one:

- Playback, presets, rate-view, legend, and reduced-motion controls are all
  native `<button>` elements (`TransportBar`, `PresetSwitcher`,
  `RateViewToggle`, `AppHeader`).
- The timeline scrubber and every parameter/profile-field control in the
  inspector (`InspectorPanel`) are native `<input type="range">` /
  `<input type="number">`, each with an associated `<label>` — fully keyboard
  operable (arrow keys, Page Up/Down, Home/End on the range inputs) without
  any custom key handling.
- The profile-kind switcher is a native `<select>`.
- Vessels (`NodeVessel`) and channels (`Channel`) in the SVG network are not
  native elements, so they carry `role="button"`, `tabIndex={0}`, and an
  `onKeyDown` handler that treats `Enter` and `Space` as activation
  (`e.preventDefault()` + the same handler the `onClick` uses), matching
  native button behavior for selection.

### Visible focus states

`--focus-ring` (`src/design-system/tokens.css`) — a two-layer ring (`0 0 0
2px var(--bg), 0 0 0 4px rgba(234, 238, 246, 0.85)`) — provides visible focus
that also has enough contrast against the dark background to double as a
tritanopia/low-vision-safe outline, not just a color shift.

### Labels and units

Every numeric control states its unit alongside its label: inspector rows
render `{label} ({unit})` (`InspectorPanel`'s `NumericRow`), and every
`aria-label` that surfaces a live value includes the unit — e.g. a vessel's
`aria-label` is `"{species.label}: {formatAmount(quantity)} {unit}"`
(`NodeVessel`), a channel's is `"{process.label}: net rate {rate} {unit} per
second"` (`Channel`), and the basin's is `"{reservoir.label}: {amount} {unit}
collected"` (`ReservoirBasin`).

### `aria-live` status announcer

`StatusAnnouncer` (`src/components/controls/StatusAnnouncer.tsx`) is a
visually hidden `aria-live="polite"` region that describes play/pause state
and every species' and the reservoir's current amount in one sentence. It
updates immediately on any play/pause change, and otherwise is throttled to
once every `ANNOUNCE_INTERVAL_MS` (5000 ms) while playing, so a screen reader
user gets periodic updates without being flooded on every animation frame.
When the simulation is invalid, it announces the failure message instead
(`"Simulation invalid: {error.message} Playback is stopped. Use reset to
restore the preset."`) rather than a quantity summary.

### Invalid simulation state

When `integrate()` returns an invalid `SimulationResult` (see
[architecture.md](./architecture.md#execution-and-run-identity)), the network view is
replaced by `InvalidStatePanel` (`src/components/controls/InvalidStatePanel.tsx`),
a `role="alert"` region — so assistive technology announces the failure the
moment it appears, without waiting on the throttled `aria-live="polite"`
`StatusAnnouncer`. The panel states the failure in plain language, lists the
structured error details (failure kind, state, time/step, value, tolerance,
steps completed) in a `<dl>`, and provides the only way back: a single native
`<button>` labeled "Reset preset defaults" that calls
`resetToPresetDefaults()`. Recovery requires no new interaction pattern — the
button is keyboard- and screen-reader-operable the same way every other
control in the app is (see "Keyboard operability" above).

### Overlay focus management

The parameters drawer (`InspectorPanel`) and the "how to read" legend
overlay (`LegendCard`) are the only two card/panel surfaces in the app (see
[visual-language.md](./visual-language.md#the-quiet-instrument-identity)),
and both manage focus the same way, via a pair of `useEffect` hooks that
mirror each other in the two components:

- **On open**, the component records `document.activeElement` (the trigger
  that opened it) and immediately moves focus to the panel's own close
  button.
- **On close**, focus returns to whatever element was previously recorded —
  the trigger — rather than being left on a now-removed or now-hidden
  element.
- **`Escape`** closes either overlay from anywhere on the page while it is
  open, via a `document`-level `keydown` listener installed only while the
  panel is open.

Both are also `role="dialog"` with an `aria-label` ("Parameters" / "How to
read"), so assistive technology announces them as a dialog when focus moves
in. The legend is closed by default (`legendOpen` starts `false` in
`src/state/simulation-store.ts`) and is opened only via the rail's
"How to read" button (`legend-toggle`) or a user pressing it again to close;
clicking the scrim behind the legend card also closes it, in addition to the
close button and `Escape`.

### Exhibition mode

Exhibition (kiosk) mode's UI recession (see
[architecture.md](./architecture.md#rendering-and-accessibility)) fades the rail,
transport, and time axis to `opacity: 0` with `pointer-events: none` after a
period of no pointer, keyboard, or focus activity
(`exhibition.css`, `.app-root.is-exhibit.is-recessed .rail` etc.). This is a
visual-only change: the elements are never removed from the DOM or given
`aria-hidden`/`display: none`, so they stay in the accessibility tree
throughout. Each recessed region also carries a `:focus-within` override
(`opacity: 1; pointer-events: auto`) — if a control inside the rail,
transport, or axis is focused (e.g. by keyboard) while the chrome is
recessed, that region snaps back to visible immediately, so a focused
control is never left invisible or unreachable mid-interaction. The caption
and the trace strips' live readout columns never fully hide during
recession; they dim to `opacity: 0.5` instead of `0`.

Exhibition mode's auto-advance sequence (hold the finished trajectory →
fade the field out → select the next preset → show its caption → fade back
in) respects reduced motion selectively: under `prefers-reduced-motion` (or
the in-app override, both read via the same `useReducedMotion` used
elsewhere), the two 400 ms opacity fades between scenes are skipped —
`useExhibition.ts` sets `fadeMs` to `0` — but the 6-second hold on the
finished frame and the 4-second caption interstitial keep their normal
timing either way, since neither of those is an animation.

### Reduced motion

Two layers, combined in `useReducedMotion` (`src/lib/accessibility/useReducedMotion.ts`):

1. The OS `prefers-reduced-motion: reduce` media query, read live via
   `useSyncExternalStore`.
2. An in-app override (`reducedMotionOverride` in the store: `null` follows
   the OS setting; `true`/`false` pins it), toggled by a header button
   (`AppHeader`, the "Reduce motion" icon button with `aria-pressed`) — so a
   user can turn reduced motion on even when their OS default is full motion,
   or off again, independent of the OS setting.

When reduced motion is active, `NetworkView` skips rendering
`ParticleLayer` entirely; nothing else about the view degrades (see next
section).

### No meaning by color or animation alone

Every encoding that uses color or motion has at least one redundant,
non-color, non-motion carrier:

| Meaning                  | Color/motion carrier                                     | Redundant carrier(s)                                                                                                                                             |
| ------------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Species identity         | `colorVar` fill/stroke                                   | Symbol letter + text label on every vessel                                                                                                                       |
| Forward vs. reverse flow | Destination-node color                                   | Direction chevrons; particle travel direction; reverse chart lines are dashed                                                                                    |
| Active vs. idle channel  | Translucent colored rate band (present only when active) | Permanent structural hairline and one chevron render at every rate, including zero — a channel's existence and direction are never dependent on its colored band |
| Rate magnitude           | Particle frequency (motion)                              | Channel stroke width (static, sqrt-scaled) and the numeric rate label                                                                                            |
| Selection                | Brighter stroke                                          | Rate label forced visible; chart line thickened and de-emphasizes others                                                                                         |
| Cumulative output        | Basin fill rising                                        | Numeric readout beneath the basin                                                                                                                                |

Turning off motion (reduced-motion mode) or being unable to distinguish the
palette's hues never removes access to a value — only the animated particle
stream disappears; widths, chevrons, dashes, and numeric labels all remain.

### Charts without hovering

Each `TimeSeriesChart` (quantity and rate charts) renders a right-edge live
readout column (`data-testid="readout-quantities"` / `"readout-rates"`) with
one row per series — a color swatch, the series' label, and its current
value — that updates continuously during playback and always shows the
value at the current or hovered time as text. The time axis beneath the
strips (`data-testid="time-readout"`) always shows the current playback time
the same way. Both render unconditionally, so every chart is fully readable
without ever hovering or dragging.

## How to report an issue

Open an issue using the repository guidance in [CONTRIBUTING.md](../CONTRIBUTING.md). Use the bug
report template, note the assistive technology and browser tested, and apply the `a11y` label.

## Current gaps

- The field canvas is described and paired with Study observables, but it does not expose every
  grid cell as an assistive-technology table. A useful summary or downloadable table should be
  designed before adding thousands of inaccessible cell nodes.
- Scientific SVGs have concise image labels; their individual marks are not all independently
  focusable. Study is the structured text / table alternative.
- The preserved reaction-network SVG exposes vessels, channels, and the basin individually, but
  still lacks a full-series data-table equivalent.
