# ADR 0003: Particle rate encoding

**Status:** accepted

**Scope:** preserved specialized reaction-network runtime. A museum Dynamical Portrait that uses
`event-frequency` declares its own event quantum and cumulative observable in the reviewed
semantic binding; see [ADR 0006](./0006-dynamical-portrait-runtime.md). The shared constants below
must not be imposed on unrelated works.

## Context

The network view needs to show, at a glance, how much material is moving
through each channel and in which direction, without misrepresenting the
underlying rate. Two numbers are available per channel per instant: the
instantaneous rate and — over a played interval — its time integral (the
amount actually transferred). The visual system needed one consistent way to
turn "how much is flowing" into particle motion.

## Decision

- **Particle emission frequency is driven by integrated rate through a fixed
  quantum**, not by instantaneous rate directly and not by any random
  process. Each lane (`LaneState`, `src/visualization/particles/particle-engine.ts`)
  accumulates `rate * dtSim` every step; crossing `PARTICLE_QUANTUM` (0.12
  quantity units, `src/design-system/motion.ts`) emits exactly one particle
  and subtracts the quantum back out. The count of particles emitted over any
  played interval is therefore the integral of the rate over that interval,
  divided by the quantum — deterministic given the trajectory and the played
  path.
- **Particle travel time is a fixed wall-clock duration**
  (`PARTICLE_TRAVEL_SECONDS = 1.4s`), independent of rate, channel length, or
  playback speed. It carries no rate meaning at all — it exists purely so a
  particle is visible in motion for a comfortable, legible duration.
- **Channel stroke width is a separate, continuous encoding** of
  instantaneous `|rate|` (`rateToWidth`, sqrt-scaled — see
  [visual-language.md](../visual-language.md)), rendered every frame
  regardless of particle state. Width and particle frequency intentionally
  encode the same underlying quantity (rate) through two different,
  redundant channels — one continuous and instantaneous, one discrete and
  integrated — rather than splitting rate and "amount moved" across width and
  particles.

## Consequences

- Particle frequency is exactly reproducible from the trajectory and the
  played time interval; two runs playing the same trajectory over the same
  interval at any speed emit the same number of particles per lane (subject
  to the `MAX_PARTICLES_PER_LANE` display cap), satisfying numerical
  invariant #4 ("particle emission derives from integrated rates... never
  arbitrary timing").
- Because travel time is fixed, a viewer never has to judge speed to read
  rate — rate is read from frequency and width, which are also the two
  numbers actually driven by the trajectory. This also means high-speed
  playback (4x) does not turn into a blur of impossibly fast-moving dots;
  particles keep a legible, constant travel time while simply appearing more
  often.
- `MAX_PARTICLES_PER_LANE` (14) exists specifically because integrated-rate
  emission at high speed/high rate would otherwise produce unbounded
  concurrent particles; the cap keeps the scene calm without changing the
  emission math (excess emissions still consume the accumulator and count
  toward `emittedQuanta`, they just don't all get a visible particle).
- Scrubbing must explicitly reset lane accumulators and in-flight particles
  (`resetLane`, triggered by `SCRUB_RESET_THRESHOLD`) — an integrated-rate
  scheme has no natural way to represent "jump discontinuously in time"
  other than discarding in-flight state, which is the intended behavior (see
  [architecture.md](../architecture.md)).

## Alternatives considered

- **Speed-encodes-rate** (constant particle emission, with a faster-moving
  particle indicating a higher rate): rejected as illegible in practice —
  speed differences are hard to judge accurately at a glance, especially
  across multiple simultaneously animating channels, and the encoding
  aliases at high rates (particles moving fast enough become impossible to
  count or individually track, collapsing back into "there's motion" with no
  further discrimination).
- **Random/Poisson-process emission timing** (particles appear at random
  intervals with a mean set by the rate): rejected as non-deterministic —
  it would violate the "deterministic inputs produce deterministic results"
  invariant for anything user-visible, make automated/visual testing of
  particle behavior unreliable, and be actively misleading since the
  underlying model has no stochastic component at all (KinetiFlux is
  explicitly deterministic — see `AGENTS.md`, "Deliberately not in this
  version: stochastic simulation").
