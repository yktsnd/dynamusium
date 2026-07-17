# Visual language

The canonical number-to-pixel mappings live in
`src/visualization/visual-scales.ts` and `src/design-system/motion.ts`; no
component may invent its own scaling. This document explains what each visual
attribute means, then the design-token identity underneath it.

## Semantics

### Vessel fill height

`quantityToFill(quantity, capacity)` = `quantity / displayCapacity`, clamped
to `[0, 1]`, mapped **linearly** to fill height. `displayCapacity` is a
per-species display maximum (`SpeciesDef.displayCapacity`), not a physical
cap — a quantity above it simply renders as a full vessel.

### Channel stroke width

`rateToWidth(rate, rateScale)` maps `|rate|` through a **square-root** scale
(`u = sqrt(|rate| / rateScale)`, clamped to `[0, 1]`) between
`CHANNEL_MIN_WIDTH` (1.25px) and `CHANNEL_MAX_WIDTH` (9px), so that the
stroke's rendered _area_ — not just its width — reads roughly proportional to
rate. `rateScale` is the maximum gross rate (forward or reverse, across every
process) observed in the current trajectory, computed once per trajectory in
`NetworkView`.

### Particle frequency

Particle emission is driven by integrated rate, not by instantaneous rate or
a timer. Each lane (`LaneState` in `src/visualization/particles/particle-engine.ts`)
accumulates `rate * dtSim` every step; whenever the accumulator crosses
`PARTICLE_QUANTUM` (0.12, in model quantity units — `src/design-system/motion.ts`),
one particle is emitted and the quantum is subtracted back out. Total
particles emitted over a played interval therefore tracks the actual integral
of the rate over that interval — particle _frequency_ is the rate encoding.

### Particle travel time

`PARTICLE_TRAVEL_SECONDS` (1.1 s of wall clock) is how long a particle takes
to cross its channel, fixed regardless of rate, playback speed, or channel
length. This is deliberately **not** a rate encoding — a fast-flowing channel
emits particles more often, it does not make them travel faster. See
[ADR 0003](./decisions/0003-particle-rate-encoding.md) for why.

### Direction

Direction is carried redundantly by three things at once: chevron marks along
the channel (`Chevrons` in `src/visualization/channels/Channel.tsx`, oriented
by lane direction and faded on idle lanes), the actual travel direction of
particles, and — in directional view — two vertically offset lanes per
reversible process (`LANE_OFFSET` = 9 units in
`src/visualization/network/geometry.ts`): the forward lane runs `from -> to`,
the reverse lane `to -> from`.

### Net vs. directional view

`rateView` (`'net' | 'directional'`, in the store) controls how reversible
processes render:

- **Directional**: two lanes, one per direction, each with its own width,
  chevrons, and particle stream, driven by `forward` and `reverse`
  independently.
- **Net**: one signed lane. `netLanes()` in `Channel.tsx` picks the lane
  orientation from the sign of `net` — the lane points `from -> to` when `net
  > = 0`, and flips to `to -> from`otherwise — and its width/particles are
driven by`|net|`.

Irreversible processes (`inflow`, `outflow`, or a `conversion` without
`reverseParam`) always render as a single lane driven by `net`, since
`reverse` is structurally zero.

### Selection

Selecting a vessel or channel (click, or `Enter`/`Space` while focused)
brightens its stroke (`.is-selected`), and forces its rate label to render
(`showRateLabel` in `NetworkView`) regardless of the reduced-motion state.
The corresponding chart line is emphasized (`emphasis` prop in
`RateChart`/`TimeSeriesChart`): the selected series renders at full opacity
and a thicker stroke width (3px vs. 2px) while every other series dims to
`opacity: 0.35`.

### Inactive channel

A lane whose rate falls below `INACTIVE_RATE_FRACTION` (0.004) of the current
`rateScale` renders `is-idle`: no stroke color (falls back to the CSS default,
a faint line), dashed, and its chevrons render in a dimmed idle state. This
is a rendering threshold only — it never affects the underlying rate value or
any computed number.

### Cumulative output (basin)

The reservoir basin's fill uses the same linear `quantityToFill` mapping as a
species vessel, but the underlying `reservoir` series is guaranteed
nondecreasing by the solver (see
[numerical-method.md](./numerical-method.md)), so the basin's fill visually
only ever rises or holds — it never drops.

### Chart colors: destination-node convention

A channel's stroke, its particles, and its corresponding rate-chart line all
share one color, chosen by **destination**: for `inflow` and `conversion`
processes that color is the `to`-species' `colorVar`; for `outflow` it is the
reservoir's `colorVar`. The reverse lane of a reversible conversion uses the
color of _its_ destination, i.e. the `from`-species — so a reverse lane is
never the same color as its forward lane, and a reverse line in the chart
renders dashed as an additional, color-independent cue (see `RateChart`,
`Channel`).

### Invalid / edge states

- An empty vessel (quantity effectively zero) renders no fill rectangle at
  all — `NodeVessel` and `ReservoirBasin` both skip the fill graphic when
  `fillH <= 0.5`px, rather than drawing a zero-height or negative shape.
- Non-finite values format as an em dash: `formatAmount` (`src/lib/formatting/format.ts`)
  returns `'—'` for any value that fails `Number.isFinite`, instead of
  rendering `NaN` or `Infinity`.

### Reduced motion

When reduced motion is active (OS preference or the in-app override — see
[accessibility.md](./accessibility.md)), `NetworkView` omits `ParticleLayer`
entirely. Everything else stays: chevrons, channel widths, numeric rate
labels (`showRateLabel` becomes unconditionally true when
`reducedMotion` is on), and chart updates. No information is lost in reduced
motion — only the animated particle stream is removed.

## Visual identity

### Single "deep ink" theme

KinetiFlux ships one dark theme (`src/design-system/tokens.css`), by design,
rather than a light theme and a dark theme. The rationale: one exceptionally
polished, fully validated theme is worth more than two incomplete ones, and a
dark ground (`--bg: #0b0e15`) makes translucent fills and small particles
legible in a way a light background does not. A second theme is on the
roadmap only if it can be brought to the same quality bar (see README).

### Type roles

Three typefaces, each with one job, all via Fontsource (`@fontsource-variable/*`):

| Role                                    | Typeface                         | Token            |
| --------------------------------------- | -------------------------------- | ---------------- |
| Display (brand, headings)               | Space Grotesk Variable           | `--font-display` |
| UI (labels, body, controls)             | Inter Variable                   | `--font-ui`      |
| Numerals (readouts, rates, tick labels) | JetBrains Mono Variable, tabular | `--font-mono`    |

Using a monospace/tabular numeral font specifically for numbers keeps
readouts from jittering horizontally as digits change during playback.

### Species palette

Four colors, chosen and validated as one set:

| Role      | Color               | Token         |
| --------- | ------------------- | ------------- |
| Species A | `#C98500` (amber)   | `--species-a` |
| Species B | `#3987E5` (blue)    | `--species-b` |
| Species C | `#D55181` (magenta) | `--species-c` |
| Reservoir | `#008300` (green)   | `--reservoir` |

Per the comment at the top of `tokens.css`, this set is CVD-validated
(adjacent pairs and all pairs) against the surface color `--bg` (`#0B0E15`)
using the dataviz six-check validator. **Changing any one color in this set
requires re-validating the whole set** — pairwise contrast/distinguishability
is a property of the set, not of any single color in isolation.

Identity is never carried by color alone anywhere in the app: species vessels
carry a symbol letter and a text label, chart series carry direct labels in
the legend and readout row, reverse-rate lines are dashed, and direction is
additionally carried by chevrons and particle travel. A person who cannot
distinguish the palette's hues can still read every value the palette
encodes.
