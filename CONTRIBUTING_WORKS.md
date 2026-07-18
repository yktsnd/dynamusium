# Contributing a DynaMusium work

A work is accepted when it is scientifically sourced, deterministic, meaningfully interactive,
and legible in Observe and Study modes. A static card, screenshot, or unimplemented manifest is
not a work.

## Fast path

1. Run `npm run work:new -- <slug> "<Title>"`.
2. Choose one gallery, runtime, and renderer from `src/works/work.schema.json`.
3. Supply at least two bounded parameters and three curated presets.
4. Add a canonical or primary HTTPS citation and write original explanatory copy.
5. Register the kernel in `src/museum/simulation.ts`, or reuse an existing kernel only when the
   equations and interpretation are genuinely the same.
6. Add an invariant test: conservation, fixed point, reference value, boundedness, or another
   property appropriate to the model.
7. Run `npm run work:validate`, `npm run check`, and `npm run test:e2e`.

## Runtime contract

- `reaction-network-v1`: first-order driven conversion networks.
- `ode-v1`: deterministic continuous state integrated from explicit derivatives.
- `field-v1`: deterministic 1D/2D scalar fields with bounded grid resolution.
- `discrete-v1`: maps, cells, and seeded deterministic sampling.
- `analytic-v1`: closed-form geometry or observation curves.

Identical manifest, parameter, preset, and seed inputs must produce identical outputs. A kernel
must surface non-finite values as a failure rather than silently hiding them. Model equations may
not be duplicated in UI components.

## Curatorial contract

- The title names a recognized model, not a marketing theme.
- The subtitle adds an observation, not a second title.
- The question tells the visitor what to look for.
- Parameters must cross a meaningful regime or threshold.
- Citations support the implemented equation or canonical interpretation.
- Copy must be original; do not paste textbook or paper prose.
- Images, datasets, and recordings require explicit source and license metadata.

Pull requests should include the work slug, scientific validation used, screenshots at desktop
and 390px width, and confirmation that reduced-motion and keyboard operation were checked.
