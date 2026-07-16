# CLAUDE.md

Read and follow **`AGENTS.md`** — it is the canonical repository guide
(purpose, repository map, architectural boundaries, numerical and visual
invariants, commands, change workflow, prohibited shortcuts).

Tool-specific notes:

- Validate with `npm run check`; e2e via `npx playwright install chromium`
  then `npm run test:e2e`.
- Imports use explicit `.ts`/`.tsx` extensions (`allowImportingTsExtensions`).
- When changing anything visual, actually open the rendered app before
  claiming the change works.
