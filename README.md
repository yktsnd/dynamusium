<div align="center">
  <img src="docs/media/mark.svg" width="72" alt="DynaMusium mark" />

# DynaMusium

**Museum of Dynamic Systems**

Thirty interactive mathematical models across motion, matter, life, Earth, and the cosmos.
</div>

DynaMusium treats a scientific model as a cultural object: something to observe, operate,
question, source, and preserve. Every work is computed in the browser and connects its
trajectory or spatial field to live controls, synchronized traces, equations, citations, and
an accessible data table.

## The collection

| Gallery          | Works                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| Motion & Chaos   | Double Pendulum, Kuramoto Oscillators, FPUT Chain, Logistic Map, Wave Equation, Standard Map         |
| Matter & Pattern | Fed Reaction Chain, Gray–Scott, Heat/Diffusion, Schrödinger Wave Packet, Ising Model, Cahn–Hilliard  |
| Life & Reaction  | Lotka–Volterra, Brusselator, Oregonator, SIR, Hodgkin–Huxley, FitzHugh–Nagumo                        |
| Earth & Climate  | Lorenz Atmosphere, Stommel Box, Daisyworld, Carbon Cycle, Shallow-Water, Budyko–Sellers              |
| Cosmos & Gravity | Restricted Three-Body, Kepler Orbit, Hohmann Transfer, N-Body, Friedmann–Lemaître, Exoplanet Transit |

The first six are flagship rooms with a deliberately cinematic observation mode. The other
twenty-four use the same museum-grade interaction, provenance, and accessibility contract.

## Run locally

```bash
git clone https://github.com/yktsnd/dynamusium.git
cd dynamusium
npm ci
npm run dev
```

Validation:

```bash
npm run check
npm run test:e2e
npm run work:validate
```

The application is static, client-only, and deploys to GitHub Pages. It has no account,
backend, analytics, upload surface, or persistent storage.

## Add a work

```bash
npm run work:new -- rossler-attractor "Rössler Attractor"
```

This creates a JSON manifest under `src/works/community/`. Complete its scientific metadata,
register or reuse a deterministic kernel, then run `npm run work:validate` and the test suite.
There is no central hand-maintained registry: community manifests are discovered at build
time. See [CONTRIBUTING_WORKS.md](./CONTRIBUTING_WORKS.md) for the full contract.

## Architecture

- `src/museum/catalog.ts` — the thirty-work permanent collection and dynamic manifest discovery.
- `src/museum/simulation.ts` — deterministic ODE, discrete, field, and analytic kernels.
- `src/museum/MuseumApp.tsx` — Entrance, Collection, Observe, Study, and Exhibit experiences.
- `src/works/work.schema.json` — machine-readable contribution contract.
- `src/model/`, `src/solver/`, `src/state/` — the preserved, rigorously tested reaction-network core.

The visual atmosphere never encodes scientific values. Data color, position, trace, and motion
are derived from the computed result; the cosmic/deep-ocean environment remains a separate,
decorative layer.

## License

Code and original museum copy are released under the [MIT License](./LICENSE). Equations are
facts; citations identify the historical or canonical sources used to define each work. No
third-party stock imagery is distributed with the museum.
