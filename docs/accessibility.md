# Accessibility

## Keyboard operability

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

## Visible focus states

`--focus-ring` (`src/design-system/tokens.css`) — a two-layer ring (`0 0 0
2px var(--bg), 0 0 0 4px rgba(234, 238, 246, 0.85)`) — provides visible focus
that also has enough contrast against the dark background to double as a
tritanopia/low-vision-safe outline, not just a color shift.

## Labels and units

Every numeric control states its unit alongside its label: inspector rows
render `{label} ({unit})` (`InspectorPanel`'s `NumericRow`), and every
`aria-label` that surfaces a live value includes the unit — e.g. a vessel's
`aria-label` is `"{species.label}: {formatAmount(quantity)} {unit}"`
(`NodeVessel`), a channel's is `"{process.label}: net rate {rate} {unit} per
second"` (`Channel`), and the basin's is `"{reservoir.label}: {amount} {unit}
collected"` (`ReservoirBasin`).

## `aria-live` status announcer

`StatusAnnouncer` (`src/components/controls/StatusAnnouncer.tsx`) is a
visually hidden `aria-live="polite"` region that describes play/pause state
and every species' and the reservoir's current amount in one sentence. It
updates immediately on any play/pause change, and otherwise is throttled to
once every `ANNOUNCE_INTERVAL_MS` (5000 ms) while playing, so a screen reader
user gets periodic updates without being flooded on every animation frame.

## Reduced motion

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

## No meaning by color or animation alone

Every encoding that uses color or motion has at least one redundant,
non-color, non-motion carrier:

| Meaning                  | Color/motion carrier          | Redundant carrier(s)                                                          |
| ------------------------ | ----------------------------- | ----------------------------------------------------------------------------- |
| Species identity         | `colorVar` fill/stroke        | Symbol letter + text label on every vessel                                    |
| Forward vs. reverse flow | Destination-node color        | Direction chevrons; particle travel direction; reverse chart lines are dashed |
| Active vs. idle channel  | Full-opacity vs. faint stroke | Dashed stroke pattern (`is-idle`)                                             |
| Rate magnitude           | Particle frequency (motion)   | Channel stroke width (static, sqrt-scaled) and the numeric rate label         |
| Selection                | Brighter stroke               | Rate label forced visible; chart line thickened and de-emphasizes others      |
| Cumulative output        | Basin fill rising             | Numeric readout beneath the basin                                             |

Turning off motion (reduced-motion mode) or being unable to distinguish the
palette's hues never removes access to a value — only the animated particle
stream disappears; widths, chevrons, dashes, and numeric labels all remain.

## Charts without hovering

Each `TimeSeriesChart` (quantity and rate charts) has a legend row
(`role="list"`, one labeled swatch per series, dashed swatches for reverse
lines) and a readout row beneath the plot
(`data-testid="readout-{title}"`) that always shows the current playback
time and every series' current value as text — both render unconditionally,
so the chart is fully readable without ever hovering or dragging.

## How to report an issue

File it per [CONTRIBUTING.md](../CONTRIBUTING.md#reporting-an-accessibility-issue):
use the bug report template, note the assistive technology and browser you
tested with, and label the issue `a11y`.

## Current gaps

- There is no full screen-reader-accessible data table alternative for chart
  series yet — the readout row surfaces only the value at the current/hover
  time, not the whole series.
- The SVG network is exposed to assistive technology via `aria-label`s on
  individual vessels, channels, and the basin (plus the `StatusAnnouncer`
  summary), not via a structured data-table equivalent of the whole system
  state.
