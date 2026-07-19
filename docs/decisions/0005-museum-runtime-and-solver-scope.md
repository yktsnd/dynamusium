# ADR 0005: Museum runtime and solver scope

**Status:** superseded by [ADR 0006](./0006-dynamical-portrait-runtime.md)

This document is retained as the decision for the first museum-array runtime. Its single
`WorkResult` normalization, fixed-RK4 scope, and last-valid-result behavior no longer describe the
current Dynamical Portrait execution boundary.

## Context

The original application exposed one first-order reaction network through a fixed-step RK4
solver. DynaMusium must present thirty models spanning smooth ODEs, discrete maps, spatial
fields, and closed-form observational geometry without coupling equations to React.

Issue #11 asks whether an adaptive solver should replace fixed-step RK4. The permanent
collection provides a concrete workload for that decision.

## Decision

- Preserve the original typed reaction solver and all of its numerical safety invariants.
- Normalize museum output as `WorkResult`: time, labelled series, trajectory points, optional
  bounded spatial field, and diagnostics.
- Dispatch deterministic kernels by declared runtime kind and run interactive recomputation in
  a Web Worker. The first result is computed synchronously to avoid an empty initial room.
- Keep fixed-step RK4 with model-specific bounded steps for the v1 ODE collection. The catalog
  test executes all thirty canonical works in roughly a quarter second on the development
  machine; all output is finite and deterministic. Shipped parameter bounds are part of the
  numerical contract.
- Defer a general RK45 implementation. It would add rejection, interpolation, and diagnostics
  policy that no shipped preset currently needs. Revisit when a reviewed work cannot meet its
  reference tolerance within the fixed-step performance budget.

## Consequences

The museum can grow across scientific domains without weakening the original solver or making a
single universal schema pretend every system is a reaction network. Contributors must add an
invariant or reference-value test with every new kernel. Worker failure is visible in the UI and
does not replace the last valid result with fabricated data.
