# Contributing to DynaMusium

Thank you for helping build a rigorous, beautiful museum of dynamic systems.
`AGENTS.md` is the canonical engineering guide; `CONTRIBUTING_WORKS.md` defines
the scientific and curatorial contract for new works.

## Local setup

- Node.js 20 or newer
- `npm ci`
- `npm run dev`

Before opening a pull request, run:

```bash
npm run work:validate
npm run check
npm run test:e2e
```

Numerical changes require an invariant or reference-value test. Interaction and
accessibility changes require Playwright coverage. Visual changes require desktop
and 390px screenshots and must preserve the separation between decorative room
atmosphere and scientific encoding.

Keep pull requests focused, describe why the change is meaningful, cite model
sources, and never use placeholder data or unlicensed media as a final asset.
