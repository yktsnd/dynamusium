# Visual language

DynaMusium separates three responsibilities:

1. numerical kernels expose state and observables;
2. reviewed `SemanticVisualLayer` records what each visual channel means;
3. composition and rendering decide how those immutable layers inhabit the museum room.

The museum-wide contract lives in `src/museum/portrait-types.ts` and
`src/museum/portrait-validation.ts`. The specialized reaction-network scales remain in
`src/visualization/visual-scales.ts` and `src/design-system/motion.ts`. Components may implement a
reviewed grammar, but they may not invent a data transform, silently autoscale away an overflow,
or use decorative motion as a scientific value.

## Semantic visual layers

A layer names a scientific object, the regimes in which it is valid, a mark, one or more channel
bindings, an optional state-space projection, scientific-time behavior, and a reduced-motion
alternative. A binding declares:

- the exact `quantityRef` and unit;
- channel and scale (`linear`, `sqrt`, `log`, `symlog`, `categorical`, or `cyclic`);
- a reviewed finite domain and zero where relevant;
- what happens outside the domain (`overflow-indicator`, `clip-with-indicator`, or cyclic wrap);
- an optional uncertainty reference.

Fixed domains make parameter and preset comparisons honest. Clipping is a visual operation only;
the underlying value stays in Study and an overflow remains perceptible. A field raster reads the
current computed frame and declared component domain. A path projection names its state
coordinates and aspect convention; high-dimensional state is not automatically turned into 3D.

`src/museum/semantic-visual.ts` is the shared numeric binding interpreter. It applies the declared
linear, square-root, logarithmic, symmetric-log, or cyclic transform and reports whether the raw
value lies outside the reviewed domain. Museum renderers use that result for mark geometry and an
explicit overflow label / count; they do not substitute a per-frame autoscale. Categorical
bindings are not passed through the numeric interpreter.

An `event-frequency` channel is special because event order is stateful. Its binding must declare
a positive `eventQuantum` and an `eventAccumulatorRef`. The kernel integrates the cumulative
amount and returns that observable; the renderer uses it only to place deterministic event marks.
It must not numerically integrate instantaneous rates in React. A work-specific quantum (the Fed
portrait currently uses 0.25 amount units) is part of the reviewed mapping and is distinct from the
legacy reaction instrument's shared `PARTICLE_QUANTUM` below.

### Marks and appropriate channels

The validator restricts channels by mark. Examples include:

| Scientific object                    | Primary mark                         | Appropriate channel meaning                                  |
| ------------------------------------ | ------------------------------------ | ------------------------------------------------------------ |
| Orbit segment / recurrent trajectory | `path`                               | selected state coordinates -> position                       |
| Oscillator phase and order parameter | `glyph`                              | phase -> cyclic position / orientation; coherence -> length  |
| Quantity and directional flux        | `fill` + path / particles            | amount -> fill; flux -> width and integrated event frequency |
| Modal energy                         | `fill` / region                      | energy fraction -> area or height                            |
| Empirical measure                    | `region` / raster                    | finite occupancy -> luminance or area                        |
| Spatial field                        | `field-raster` / `contour-line`      | component value -> declared diverging or sequential scale    |
| Interface / coherent structure       | `contour-line` / region              | computed level set or support -> position                    |
| Directional connection / Morse graph | path + glyph                         | connection evidence -> direction, never physical flux        |
| DMD mode                             | glyph / field / path, when qualified | fitted amplitude / phase with holdout residual shown         |

One artwork selects one primary scientific truth. Secondary layers must support that truth rather
than display every state variable. Absence of a computed object creates absence or an explicitly
qualified fallback; it never authorizes the renderer to guess.

## Composition boundary

`CompositionSpec` may choose approved layer order and focus, set bounded negative space, use no
camera or a bounded slow pan / zoom, and reference non-semantic atmosphere. Typography, texture,
light, spacing, captions, camera, and Exhibit dwell all belong here.

Composition cannot:

- change a quantity reference, scale, domain, zero, direction, projection, uncertainty convention,
  scientific timestamp, or reduced-motion meaning;
- turn a Morse-graph edge into flux, finite occupancy into an invariant measure, or a DMD fit into
  a proved Koopman eigenfunction;
- synthesize scientific particles, noise, defects, or uncertainty from decorative randomness;
- replace a failed or unavailable scientific layer with atmosphere that looks data-bearing.

This boundary is independent of authoring software. No external composition tool is required or
privileged. Fable, if someone elects to use it, is only one optional source of composition metadata
within these limits; changing semantic mappings requires a new scientific review and manifest
version.

## Observe, Study, and Exhibit

- **Observe** shows the primary layer and at most a few necessary supports. The phenomenon, not UI,
  is the dominant image.
- **Study** exposes the equation, representation, projection, units, scale domain, provenance,
  checks, maturity, limitations, source, and current numerical values.
- **Exhibit** uses the same semantic layers and scientific samples. It may lengthen dwell, recede
  chrome, or stage slow composition changes, but never change frequency, flux, decay, or event
  order.

Reduced motion is a semantic alternative, not just `animation-duration: 0`: a trajectory can use
an accumulated path or small multiples; an ensemble can use density; a flux network keeps width,
direction, and numeric values; a field keeps the selected computed frame. The visitor can still
scrub scientific time.

## Specialized quantity / flux semantics

The following mappings are the preserved reaction-network grammar. They apply to works whose
portrait declares amount and directional-flux objects; they are not imposed on unrelated models.

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

`PARTICLE_TRAVEL_SECONDS` (1.4 s of wall clock, `src/design-system/motion.ts`)
is how long a particle takes to cross its channel, fixed regardless of rate,
playback speed, or channel length. This is deliberately **not** a rate
encoding — a fast-flowing channel emits particles more often, it does not
make them travel faster. See
[ADR 0003](./decisions/0003-particle-rate-encoding.md) for why.

A particle's opacity is a purely presentational easing on top of that travel:
`fadeOpacity` in `ParticleLayer.tsx` ramps 0→1 over the first 8% of a
particle's progress along its lane and 1→0 over the last 8%, so dots appear
and disappear softly at the vessel/basin edges instead of popping in and out.
Particles render at a fixed radius (`r={2.6}`). None of this affects _when_ a
particle is emitted — emission timing is entirely the integrated-rate quantum
scheme described above, untouched by this redesign.

### Direction

Direction is carried redundantly by three things at once: a chevron mark on
the channel (`Chevrons` in `src/visualization/channels/Channel.tsx`, oriented
by lane direction and rendered identically whether or not the lane is
currently active), the actual travel direction of particles, and — in
directional view — two vertically offset lanes per reversible process
(`LANE_OFFSET` = 9 units in `src/visualization/network/geometry.ts`): the
forward lane runs `from -> to`, the reverse lane `to -> from`.

### Net vs. directional view

`rateView` (`'net' | 'directional'`, in the store) controls how reversible
processes render:

- **Directional**: two lanes, one per direction, each with its own width,
  chevrons, and particle stream, driven by `forward` and `reverse`
  independently.
- **Net**: one signed lane. `netLanes()` in `Channel.tsx` picks the lane
  orientation from the sign of `net` — the lane points `from -> to` when
  `net >= 0`, and flips to `to -> from` otherwise — and its width / particles
  are driven by `|net|`.

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
`rateScale` simply does not render its colored rate band (`channel-lane` in
`Channel.tsx`) at all — only the permanent structural hairline (see
"Filaments" below) and its chevron remain visible, at their normal,
unchanged color and weight. This is a rendering threshold only — it never
affects the underlying rate value or any computed number.

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

### The "Abyss Observatory" environment

The collection sits inside a restrained cosmic/deep-ocean environment: an
original horizon image, orbital hairlines, isolated observation stars, and
small coordinate readouts. `MuseumApp.tsx` groups the page atmosphere under
`.museum-ambient` with `aria-hidden="true"`; it never represents model state,
rate, quantity, selection, uncertainty, maturity, or validity. A dark mask
keeps scientific marks and traces on the deep-ink ground.

The background image lives at `public/cosmic-abyss.png` so the Vite base-path
configuration can serve it both locally and from GitHub Pages. Reduced-motion
mode leaves the static environment intact and disables the only ambient pulse,
the caption's live-signal dot.

### The "Quiet Instrument" identity

The whole viewport is the field. The current museum work screen composes a
thin `work-header`, a caption in negative space, one dominant scientific
artwork, synchronized trace strip, transport, presets, and a quiet parameter
drawer. Study adds evidence beside that same work instead of replacing it
with a dashboard. Exhibit recedes the same chrome. Structural separation is
made with low-contrast hairlines and translucent surfaces, not a grid of
competing cards.

The preserved reaction-network instrument uses the same identity: a top rail,
museum caption, unboxed network stage, trace strips, time axis, and transport.
Its parameters, reading legend, and invalid-state takeover are the only
strong panel surfaces. This continuity lets the internal scientific contract
change without discarding the established screen design.

### Instrument columns (vessels and the basin)

A species vessel (`NodeVessel`) renders as an **open-top** instrument column:
a left hairline, a right hairline, and a baseline (`.vessel-edge`) — no top
edge closing the shape, so it reads as a graduated tube rather than a
container. Three faint graduation ticks mark the 25/50/75% levels off the
left hairline (`.vessel-tick`). The fill itself is a translucent tinted
rectangle (`opacity: 0.22`) capped by a 2px, full-opacity meniscus line in
the species color — that meniscus line is the single brightest, most
saturated mark in the vessel, deliberately more prominent than the fill body
beneath it or the hairline frame around it. The reservoir basin
(`ReservoirBasin`) is the same open-top instrument-column language, just
wider and shorter (`BASIN_W`/`BASIN_H` vs `VESSEL_W`/`VESSEL_H` in
`network/geometry.ts`) with rounded bottom corners instead of vessels' square
baseline, and its meniscus uses `--reservoir-bright` rather than the
reservoir's base color so it stays legible against the wider fill.

### Filaments (channels)

A channel (`Channel.tsx`) is drawn as a **permanent structural hairline**
(`.channel-hairline`, `var(--line)`, 1px) for every lane, at every rate,
including zero — the connection between vessels is always visible as a
filament, whether or not anything is currently flowing through it. When a
lane's rate is active (see "Inactive channel" above), a translucent colored
rate band (`.channel-lane`, `strokeOpacity: 0.3`, width from `rateToWidth`)
is layered directly on top of that same hairline, brightening on selection
(`strokeOpacity: 0.75`). Each lane carries exactly one chevron mark
(`Chevrons`, a single small `<path>` at the lane's midpoint) rather than a
repeating chevron pattern along its length — direction is legible as one
quiet mark, not a texture.

### Feed sparkline

The external feed's profile preview (`FeedInlet`) is a bare polyline plus a
current-time dot directly on the field — no frame, no background rectangle
around it, just a label, the sparkline path, and a rate readout beneath it.

### Trace strips

`TimeSeriesChart` (used by `QuantityChart` and `RateChart`) has no chart
chrome: no card background, no border, no legend row, and no readout row
below the plot. Series identity and their current values instead live in a
**right-edge live readout column** rendered inside the same SVG
(`data-testid="readout-quantities"` / `"readout-rates"`): one row per series,
each a short color swatch, the series' short label, and its formatted
current value, vertically spread apart if needed
(`layoutReadoutRows`) so rows never overlap. That column updates continuously
during playback and during hover/scrub — it is not restricted to a
static legend. The x-axis itself carries no tick marks or tick labels inside
the trace strips anymore; both `QuantityChart` and `RateChart` render only a
y-axis tick column, a zero-line, the series paths, and the playback/hover
cursors. Horizontal (time) ticks live in exactly one place now: the time
axis below the strips.

### Time axis as scrubber

`TimeAxis` is simultaneously the x-axis for both trace strips above it and
the playback scrubber: a hairline track with faint 10-second tick marks and
labels, a native `<input type="range">` thumb for the current time, and a
right-aligned mono time readout (`data-testid="time-readout"`). It shares the
trace strips' left/right margin fractions
(`TRACE_LEFT_FRACTION`/`TRACE_RIGHT_FRACTION` in `charts/trace-layout.ts`),
so the scrubber thumb always lines up horizontally with the playback cursor
drawn inside the strips above it, at any viewport width.

### Museum caption

`Caption` renders the model's name as a small kicker label and the active
preset's one-line tagline directly beneath the top rail — plain text on the
field, no card. It replaces the old in-card stage title. In exhibition mode
it can also render `prominent` (`.caption.is-prominent`): a centered,
larger-type, full-viewport interstitial shown between auto-advanced presets
(see [architecture.md](./architecture.md) for the exhibition module).

### Single "deep ink" theme

DynaMusium ships one dark theme (`src/design-system/tokens.css`), by design,
rather than a light theme and a dark theme. The rationale: one exceptionally
polished, fully validated theme is worth more than two incomplete ones, and a
dark ground (`--bg: #0b0e15`) makes translucent fills and small particles
legible in a way a light background does not. A second theme is outside the
current contract unless it can meet the same scientific and accessibility
quality bar.

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
each trace strip's live readout column, reverse-rate lines are dashed, and
direction is additionally carried by chevrons and particle travel. A person
who cannot distinguish the palette's hues can still read every value the
palette encodes.
