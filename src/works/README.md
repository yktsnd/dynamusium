# Community manifest boundary

JSON imported from `community/` is untrusted until it passes
`manifest-validator.ts`. Importers keep JSON values as `unknown` and call
`parseCommunityManifestCollection()`; a type assertion is not a validation
boundary. The CLI and catalog use this same parser, so `work:validate` and the
production import enforce identical structural and cross-field rules.

- `work.schema.json` preserves the version-1 metadata contract. The catalog
  upgrades a validated v1 contribution only when its kernel already has a
  reviewed built-in portrait definition. An unknown v1 kernel is rejected;
  the adapter does not invent formal class, claims, or evidence.
- `work-v2.schema.json` is the preferred contribution contract. It adds the
  formal class, definition hash, reviewed parameter regime, one or more bounded
  scientific claims, validation maturity, runtime provenance, semantic visual
  mappings, reduced-motion meaning, and composition.

Run `npm run work:new -- <slug> "Title"` to create a valid v2 starting point.
Its `M0` status is deliberate: contributors must implement the named kernel and
provide evidence for requested checks before scientific review can promote it.

The v2 contract keeps scientific encoding separate from composition. A visual
layer may bind a scientific quantity to an allowed visual channel; composition
may order those reviewed layer IDs and add explicitly non-semantic atmosphere,
but it has no binding, equation, data, or geometry field with which to reinterpret
them. Unknown properties are rejected at every object boundary. Equations remain
in the work definition, and numerical state remains runtime output.

Composition authoring is tool-independent. No Fable or other external authoring
tool is required or privileged; any optional tool output must fit the same
data-free composition fields and cannot alter a semantic binding.

## Advanced-analysis evidence

The bounded helpers exported by `src/museum/advanced-analyzers.ts` are optional
authoring / build-time tools, not a way to self-award scientific maturity. The
strict v2 schema has no generic analyzer-artifact property, so do not add one to
a community manifest. Submit the report as pull-request evidence or as a
separately versioned, tracked artifact, with inputs, analyzer version, options,
status, and returned limitations. An input not reproducible from the reviewed
manifest, kernel, parameters, and seed also needs its source, applicable license
/ version, and lowercase SHA-256 content hash.

- Continuation evidence retains equilibrium and pseudo-arclength residuals,
  Jacobian sources and conditioning, stability status / residual, tolerances,
  and rejected steps. It supports a finite-precision branch segment or fold
  candidate, not a validated branch or proved bifurcation.
- EDMD evidence retains the snapshot source and hash when external, observable
  IDs / units, sample interval, chronological training and holdout ranges, each
  dictionary term's ID / definition / source, ridge and rank tolerances, rank /
  conditioning, and training, holdout, and mode residuals. It is a finite
  dictionary-dependent fit, not a complete Koopman spectrum or a proved Koopman
  eigenfunction.
- H0 evidence retains field source and hash when supplied as an external grid,
  grid shape / resolution, filtration,
  connectivity, boundary rule, persistence threshold, pairs, and limitations.
  Exactness is limited to the supplied finite grid; no continuum topology,
  higher homology, or Morse–Smale complex is implied.
- A finite-transition artifact retains cells, edges, neighborhood, boundary,
  evidence kind, and a source reference plus lowercase 64-hex SHA-256 content
  hash. It also records the sampling interval, or the interval method and caller
  coverage flag. Sampled transitions do not establish isolation or a Conley
  index. An externally certified Conley index additionally requires a verified
  index-pair certificate with method, coefficient field, homology ranks, source,
  and its own lowercase SHA-256 content hash. The generic analyzer checks only
  that the metadata and finite relation are structurally well-formed; it neither
  constructs or verifies the interval enclosure nor proves the certificate.

Do not use “validated continuation,” “Koopman spectrum / eigenfunction,” or
“Conley index” without a per-work external reviewed artifact that establishes
the exact claim.

Schema versions are dispatched explicitly in
`validateCommunityWorkManifest()`. A later contract receives its own schema and
validator instead of loosening or silently reinterpreting v1 or v2.
