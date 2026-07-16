# Contributing to KinetiFlux

Thanks for your interest in improving KinetiFlux. This document covers the
practical details of contributing code, docs, and design changes.

## Project scope

KinetiFlux is an interactive visualization tool for deterministic kinetics and
dynamic-flow models. The current version ships a single built-in demonstration
model and does not include a graphical model editor. Contributions should stay
within this scope: rendering, numerical integration, interaction design, and
presentation of deterministic dynamical systems. Please avoid biological,
medical, or pharmaceutical framing anywhere in code, docs, UI copy, or issues —
keep the language general physical chemistry / mathematical modeling.

## Local setup

- Node.js >= 20
- Install dependencies: `npm install`

## Standard commands

| Command             | Purpose                                                                     |
| ------------------- | --------------------------------------------------------------------------- |
| `npm run dev`       | Start the local dev server                                                  |
| `npm test`          | Run unit tests (Vitest)                                                     |
| `npm run test:e2e`  | Run end-to-end tests (Playwright)                                           |
| `npm run lint`      | Run ESLint                                                                  |
| `npm run typecheck` | Run the TypeScript compiler in `--noEmit` mode                              |
| `npm run format`    | Format the repo with Prettier                                               |
| `npm run build`     | Produce a production build                                                  |
| `npm run preview`   | Preview the production build locally                                        |
| `npm run check`     | Canonical all-in-one gate: format check, lint, typecheck, unit tests, build |

`npm run test:e2e` requires browser binaries. Install them once with:

```
npx playwright install chromium
```

Before opening a PR, run `npm run check` locally — it is the same gate CI
enforces.

## Branch & PR expectations

- Branch off `main`; keep PRs small and focused on one change.
- `npm run check` must pass before requesting review.
- If a change affects rendering, layout, or styling, include before/after
  screenshots (or a short screen recording) in the PR description.
- Describe the "why" of the change, not just the "what" — link any related
  issue.

## Test requirements

- Changes to numerical behavior (solver, integration step, model equations)
  require unit tests under `tests/solver` or `tests/model` that pin down the
  expected numerical result or invariant.
- Changes to UI semantics (interaction behavior, accessible names/roles,
  keyboard behavior, visible state) require end-to-end coverage under the
  Playwright suite.

## Design-change expectations

Visual changes must follow `docs/visual-language.md` and use the design
tokens defined in `src/design-system/tokens.css`. Do not introduce new colors,
spacing values, or type scales ad hoc — extend the token set instead, and
explain the addition in the PR description.

## Numerical-change expectations

Changes to the solver or model equations must follow
`docs/numerical-method.md` and preserve the invariants listed in `AGENTS.md`.
Add a regression test that would fail without the change, and note in the PR
description which invariant(s) the change affects or preserves.

## Proposing a new model

Open a feature request describing:

- the species/state variables involved,
- the processes (rate laws / flow terms) that couple them,
- the parameters and their expected ranges,
- the expected qualitative dynamics (steady state, oscillation, decay, etc.).

New models must conform to the typed contract in `src/model/schema.ts`.

## Reporting an accessibility issue

Use the bug report template, include the assistive technology and browser
you tested with, and label the issue `a11y`.
